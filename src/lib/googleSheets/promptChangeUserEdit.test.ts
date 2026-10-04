import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { googleSheetConnections, googleSheetRowMappings, vocabSets, words } from "@/db/schema";
import { getGoogleSheetTemplate, SOURCE_ID_HEADER, STT_FIELD_KEY } from "@/lib/googleSheets/template";
import { fingerprintSheetValues } from "@/lib/googleSheets/fingerprint";
import { generateSourceId } from "@/lib/googleSheets/identity";
import { gridFromValuesRange } from "@/lib/googleSheets/parser";
import { runVocabularySync } from "@/lib/googleSheets/syncVocabulary";

const enabled = process.env.GOOGLE_SHEETS_TEST_DB === "1" && Boolean(process.env.DATABASE_URL && process.env.GOOGLE_SHEET_TOKEN_ENCRYPTION_KEY);

/**
 * Spec item 17: prompt change -> Google materializes -> sync -> user edits the
 * materialized text -> user text wins. The old AI output must never come back.
 */
test("prompt change -> materialized text -> user edit keeps the user value", { skip: !enabled, timeout: 90000 }, async () => {
  const sql = postgres(process.env.DATABASE_URL as string, { max: 1, ssl: process.env.GOOGLE_SHEETS_TEST_DB_SSL === "0" ? false : "require", connect_timeout: 30 });
  try {
    const [admin] = await sql`select id from users where username = 'admin' limit 1`;
    if (!admin) return;
    const [set] = await db.insert(vocabSets).values({
      name: `__prompt_edit__${Date.now()}`, type: "ielts_vocab", languageCode: "en", translationLanguageCode: "vi",
      languageSettings: "{}", createdBy: admin.id,
    }).returning();
    const [word] = await db.insert(words).values({
      setId: set.id, position: 1, term: "mitigate", meaning: "giáº£m nháº¹", example: "old example", ipa: "/ËˆmÉªtÉªÉ¡eÉªt/",
    }).returning();
    const template = getGoogleSheetTemplate(set);
    const sourceId = generateSourceId();
    const dbValues = { term: word.term || "", meaning: word.meaning, ipa: word.ipa || "", example: word.example || "" };
    const [conn] = await db.insert(googleSheetConnections).values({
      setId: set.id, createdBy: admin.id, spreadsheetId: `prompt-${set.id}`, spreadsheetUrl: "u", spreadsheetName: "n",
      sheetId: 0, sheetTitle: template.sheetTitle, rangeA1: `'${template.sheetTitle}'!A1:Q2`,
      templateType: "ielts_vocab", templateVersion: 2, syncDirection: "google_to_lexora", deleteBehavior: "archive",
      enabled: true, status: "connected",
    }).returning();
    await db.insert(googleSheetRowMappings).values({
      connectionId: conn.id, wordId: word.id, sourceId, sheetRowNumber: 2,
      sourceFingerprint: fingerprintSheetValues(template, dbValues),
      lastSyncedFingerprint: fingerprintSheetValues(template, dbValues),
    });

    const state = { id: conn.id, setId: set.id, spreadsheetId: conn.spreadsheetId, sheetTitle: template.sheetTitle, deleteBehavior: "archive", status: "connected", enabled: true };
    const gridFor = (example: string) => gridFromValuesRange(buildRow(template, sourceId, word, example));

    // Step 1: admin changes the prompt; Google materializes the new output.
    const run1 = await db.transaction((tx) => runVocabularySync(state, gridFor("Although simple digital greetings..."), tx));
    assert.equal(run1.stats.rowsUpdated, 1, "the materialized AI output is synced");
    assert.equal((await db.select().from(words).where(eq(words.id, word.id)))[0].example, "Although simple digital greetings...");

    // Step 2: admin replaces that output with plain text "test".
    const run2 = await db.transaction((tx) => runVocabularySync(state, gridFor("test"), tx));
    assert.equal(run2.stats.rowsUpdated, 1, "the user edit is a normal UPDATE");
    assert.ok(run2.stats.changedWordIds.includes(word.id), "the edited word is reported for UI refresh");
    assert.equal(run2.stats.conflicts.length, 0, "user edit must not become a CONFLICT");

    // Step 3: a later sync (e.g. prompt reapplied elsewhere) must NOT revert it.
    const run3 = await db.transaction((tx) => runVocabularySync(state, gridFor("test"), tx));
    assert.equal(run3.stats.rowsUnchanged, 1, "the user value is stable");
    const final = (await db.select().from(words).where(eq(words.id, word.id)))[0];
    assert.equal(final.example, "test", "user-authored text is authoritative and never restored");
  } finally {
    await sql.end();
  }
});

function buildRow(template: ReturnType<typeof getGoogleSheetTemplate>, sourceId: string, word: { term: string | null; meaning: string; ipa: string | null }, example: string) {
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
