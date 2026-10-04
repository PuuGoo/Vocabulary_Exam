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
 * Exact scenario from the report: the Sheet Example cell is edited to "test".
 *
 * The sync engine must persist it as ordinary vocabulary text (never treat it
 * as an AI formula, never revert it), keep the same wordId and report the id in
 * changedWordIds so the admin UI can refresh without a browser reload.
 */
test("Sheet edit updates the same word in Postgres and reports changedWordIds", { skip: !enabled, timeout: 90000 }, async () => {
  const sql = postgres(process.env.DATABASE_URL as string, { max: 1, ssl: process.env.GOOGLE_SHEETS_TEST_DB_SSL === "0" ? false : "require", connect_timeout: 30 });
  try {
    const [admin] = await sql`select id from users where username = 'admin' limit 1`;
    if (!admin) return;

    const [set] = await db.insert(vocabSets).values({
      name: `__sheet_edit__${Date.now()}`,
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
    const [conn] = await db.insert(googleSheetConnections).values({
      setId: set.id,
      createdBy: admin.id,
      spreadsheetId: `sheet-edit-${set.id}`,
      spreadsheetUrl: "u",
      spreadsheetName: "n",
      sheetId: 0,
      sheetTitle: "Tá»« vá»±ng IELTS",
      rangeA1: "'Tá»« vá»±ng IELTS'!A1:Q2",
      templateType: "ielts_vocab",
      templateVersion: 2,
      syncDirection: "google_to_lexora",
      deleteBehavior: "archive",
      enabled: true,
      status: "connected",
    }).returning();

    const template = getGoogleSheetTemplate(set);
    const sourceId = generateSourceId();
    // lastSyncedFingerprint == the current DB content: the state right after a
    // clean sync, before the admin touches the Sheet.
    const dbValues = { term: word.term || "", meaning: word.meaning, ipa: word.ipa || "", example: word.example || "" };
    await db.insert(googleSheetRowMappings).values({
      connectionId: conn.id,
      wordId: word.id,
      sourceId,
      sheetRowNumber: 2,
      sourceFingerprint: fingerprintSheetValues(template, dbValues),
      lastSyncedFingerprint: fingerprintSheetValues(template, dbValues),
    });

    // The admin replaces the AI-generated example with the plain text "test".
    const sttIdx = template.fields.findIndex((field) => field.key === STT_FIELD_KEY);
    const sourceIdx = template.fields.findIndex((field) => field.key === SOURCE_ID_HEADER);
    const termIdx = template.fields.findIndex((field) => field.key === "term");
    const meaningIdx = template.fields.findIndex((field) => field.key === "meaning");
    const exampleIdx = template.fields.findIndex((field) => field.key === "example");
    const header = template.fields.map((field) => field.header);
    const row = template.fields.map((field, columnIndex) => {
      if (columnIndex === sttIdx) return "1";
      if (columnIndex === sourceIdx) return sourceId;
      if (columnIndex === termIdx) return "mitigate";
      if (columnIndex === meaningIdx) return "giáº£m nháº¹";
      if (columnIndex === exampleIdx) return "test";
      return "";
    });

    const state = {
      id: conn.id,
      setId: set.id,
      spreadsheetId: conn.spreadsheetId,
      sheetTitle: template.sheetTitle,
      deleteBehavior: "archive",
      status: "connected",
      enabled: true,
    };
    const { stats } = await db.transaction((tx) => runVocabularySync(state as never, gridFromValuesRange([header, row]), tx));

    const updated = (await db.select().from(words).where(eq(words.id, word.id)).limit(1))[0];
    assert.equal(updated.example, "test", "the plain-text Sheet edit is persisted as normal vocabulary");
    assert.equal(updated.id, word.id, "the wordId must stay the same (no new word)");
    assert.equal(stats.rowsUpdated, 1, "the row is counted as UPDATED");
    assert.equal(stats.rowsCreated, 0, "no duplicate word is created");
    assert.ok(stats.changedWordIds.includes(word.id), "changedWordIds reports the word so the UI can refresh");
    assert.equal(stats.conflicts.length, 0, "a normal Sheet edit must not become a CONFLICT");

    // A second identical sync is a no-op: the row is UNCHANGED, not reverted.
    const again = await db.transaction((tx) => runVocabularySync(state as never, gridFromValuesRange([header, row]), tx));
    assert.equal(again.stats.rowsUpdated, 0, "re-syncing the same row must not update again");
    assert.equal(again.stats.rowsUnchanged, 1, "re-syncing the same row must report UNCHANGED");
    const stillTest = (await db.select().from(words).where(eq(words.id, word.id)).limit(1))[0];
    assert.equal(stillTest.example, "test", "the user value is never reverted to the old DB/AI value");
  } finally {
    await sql.end();
  }
});

test("raw AI formula and plain text are told apart by the parser", () => {
  const template = getGoogleSheetTemplate({ type: "ielts_vocab", languageCode: "en" });
  const exampleIdx = template.fields.findIndex((field) => field.key === "example");
  const header = template.fields.map((field) => field.header);
  const formulaRow = template.fields.map((field, columnIndex) => (columnIndex === exampleIdx ? '=AI("prompt";G2)' : ""));
  const textRow = template.fields.map((field, columnIndex) => (columnIndex === exampleIdx ? "test" : ""));
  const formulaCell = String(gridFromValuesRange([header, formulaRow]).rows[0][exampleIdx] ?? "");
  const textCell = String(gridFromValuesRange([header, textRow]).rows[0][exampleIdx] ?? "");
  assert.equal(formulaCell.startsWith("="), true, "a real =AI() formula is recognised as raw source");
  assert.equal(textCell, "test", "plain text is returned verbatim");
});
