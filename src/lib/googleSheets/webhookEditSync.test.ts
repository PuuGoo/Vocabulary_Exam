import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { googleSheetConnections, googleSheetRowMappings, googleSheetSyncRuns, vocabSets, words } from "@/db/schema";
import { createFakeGoogleWorkspaceApi } from "@/lib/googleSheets/api";
import { getGoogleSheetTemplate, SOURCE_ID_HEADER, STT_FIELD_KEY } from "@/lib/googleSheets/template";
import { fingerprintSheetValues } from "@/lib/googleSheets/fingerprint";
import { generateSourceId } from "@/lib/googleSheets/identity";

const enabled = Boolean(process.env.DATABASE_URL && process.env.GOOGLE_SHEET_TOKEN_ENCRYPTION_KEY);

/**
 * Spec item 19: the EXACT screenshot scenario through the real webhook-triggered
 * entry point (syncConnection(trigger = "webhook")), not just the inner engine.
 *
 * Sheet Example = "test" -> syncConnection(..., "webhook") -> Postgres example
 * = "test", same wordId, a successful run with rowsUpdated + changedWordIds.
 */
test("webhook trigger syncs a plain-text Sheet edit to Postgres", { skip: !enabled, timeout: 120000 }, async () => {
  const sql = postgres(process.env.DATABASE_URL as string, { max: 1, ssl: "require", connect_timeout: 30 });
  try {
    const [admin] = await sql`select id from users where username = 'admin' limit 1`;
    if (!admin) return;

    const [set] = await db.insert(vocabSets).values({
      name: `__webhook_edit__${Date.now()}`,
      type: "ielts_vocab",
      languageCode: "en",
      translationLanguageCode: "vi",
      languageSettings: "{}",
      createdBy: admin.id,
    }).returning();
    const [word] = await db.insert(words).values({
      setId: set.id,
      position: 1,
      term: "mitigate",
      meaning: "giáº£m nháº¹",
      example: "Although simple digital greetings...",
      ipa: "/ËˆmÉªtÉªÉ¡eÉªt/",
    }).returning();
    const template = getGoogleSheetTemplate(set);
    const sourceId = generateSourceId();
    const spreadsheetId = `webhook-edit-${set.id}`;
    const rangeA1 = `'${template.sheetTitle.replace(/'/g, "''")}'!A1:Q2`;
    const [conn] = await db.insert(googleSheetConnections).values({
      setId: set.id,
      createdBy: admin.id,
      spreadsheetId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
      spreadsheetName: "IELTS Unit 012",
      sheetId: 0,
      sheetTitle: template.sheetTitle,
      rangeA1,
      templateType: "ielts_vocab",
      templateVersion: 2,
      syncDirection: "google_to_lexora",
      deleteBehavior: "archive",
      enabled: true,
      status: "connected",
    }).returning();

    const dbValues = { term: word.term || "", meaning: word.meaning, ipa: word.ipa || "", example: word.example || "" };
    await db.insert(googleSheetRowMappings).values({
      connectionId: conn.id,
      wordId: word.id,
      sourceId,
      sheetRowNumber: 2,
      sourceFingerprint: fingerprintSheetValues(template, dbValues),
      lastSyncedFingerprint: fingerprintSheetValues(template, dbValues),
    });

    // Seed the fake Google Sheet with the admin's edit: Example = "test".
    const api = createFakeGoogleWorkspaceApi();
    await api.writeValues(spreadsheetId, rangeA1, buildGrid(template, sourceId, word, "test"));

    const { syncConnection } = await import("@/lib/googleSheets/sheetLifecycle");
    const { stats, connectionId } = await syncConnection(conn.id, "webhook", { actorUserId: admin.id, apiOverride: api });
    assert.equal(connectionId, conn.id, "the same connection is used");

    const updated = (await db.select().from(words).where(eq(words.id, word.id)).limit(1))[0];
    assert.equal(updated.example, "test", "the webhook-triggered sync persists the plain-text edit");
    assert.equal(updated.id, word.id, "the wordId must stay the same");
    assert.equal(stats.rowsUpdated, 1, "rowsUpdated must be 1");
    assert.equal(stats.rowsCreated, 0, "no duplicate word is created");
    assert.ok(stats.changedWordIds.includes(word.id), "changedWordIds must include the edited word");
    assert.equal(stats.conflicts.length, 0, "a normal Sheet edit must not be a CONFLICT");

    // Spec items 1/9: a sync run is created and recorded with the outcome.
    const runs = await db.select().from(googleSheetSyncRuns).where(eq(googleSheetSyncRuns.connectionId, conn.id)).limit(5);
    assert.ok(runs.length > 0, "the webhook sync must record a run");
    const successRun = runs.find((run) => run.status === "success");
    assert.ok(successRun, "the run must finish as success");
    assert.equal(successRun.triggerType, "webhook", "the run must record the webhook trigger");
    assert.ok(typeof successRun.finishedAt === "string" || successRun.finishedAt instanceof Date, "finishedAt is recorded");
    const metadata = JSON.parse(String(successRun.metadata ?? "{}"));
    assert.ok(Array.isArray(metadata.changedWordIds) && metadata.changedWordIds.includes(word.id), "changedWordIds is persisted in the run metadata");

    // Spec item 1: the connection's last successful sync timestamp is advanced.
    const [connectionAfter] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, conn.id)).limit(1);
    assert.ok(connectionAfter.lastSuccessfulSyncAt, "lastSuccessfulSyncAt must be set after a successful sync");
    assert.equal(connectionAfter.status, "connected", "the connection must end up connected");
  } finally {
    await sql.end();
  }
});

function buildGrid(template: ReturnType<typeof getGoogleSheetTemplate>, sourceId: string, word: { term: string | null; meaning: string; ipa: string | null }, example: string) {
  const sttIdx = template.fields.findIndex((field) => field.key === STT_FIELD_KEY);
  const sourceIdx = template.fields.findIndex((field) => field.key === SOURCE_ID_HEADER);
  const termIdx = template.fields.findIndex((field) => field.key === "term");
  const meaningIdx = template.fields.findIndex((field) => field.key === "meaning");
  const ipaIdx = template.fields.findIndex((field) => field.key === "ipa");
  const exampleIdx = template.fields.findIndex((field) => field.key === "example");
  const header = template.fields.map((field) => field.header);
  const row = template.fields.map((field, columnIndex) => {
    if (columnIndex === sttIdx) return "1";
    if (columnIndex === sourceIdx) return sourceId;
    if (columnIndex === termIdx) return word.term ?? "";
    if (columnIndex === meaningIdx) return word.meaning;
    if (columnIndex === ipaIdx) return word.ipa ?? "";
    if (columnIndex === exampleIdx) return example;
    return "";
  });
  return [header, row];
}
