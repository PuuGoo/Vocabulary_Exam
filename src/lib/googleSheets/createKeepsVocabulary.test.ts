import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { vocabSets, words } from "@/db/schema";
import { createFakeGoogleWorkspaceApi } from "@/lib/googleSheets/api";
import { createGoogleSheetForSet } from "@/lib/googleSheets/sheetLifecycle";

const enabled = process.env.GOOGLE_SHEETS_TEST_DB === "1" && Boolean(process.env.DATABASE_URL && process.env.GOOGLE_SHEET_TOKEN_ENCRYPTION_KEY);

/**
 * Reported bug: creating a Google Sheet from a vocabulary set that already has
 * content wiped the exported values. Root cause: the AI formula writer planted
 * =AI(...) over rows 2..N+1 AFTER export, so the sheet ended up holding only
 * raw AI instructions instead of the user's vocabulary.
 */
test("create keeps existing vocabulary and only plants AI formulas below it", { skip: !enabled, timeout: 120000 }, async () => {
  const sql = postgres(process.env.DATABASE_URL as string, { max: 1, ssl: process.env.GOOGLE_SHEETS_TEST_DB_SSL === "0" ? false : "require", connect_timeout: 30 });
  let setId = 0;
  try {
    const [admin] = await sql`select id from users where username = 'admin' limit 1`;
    if (!admin) return;
    const [set] = await db.insert(vocabSets).values({
      name: `__gs_keep__${Date.now()}`,
      type: "ielts_vocab",
      languageCode: "en",
      translationLanguageCode: "vi",
      languageSettings: "{}",
      createdBy: admin.id,
    }).returning();
    setId = set.id;

    const wordCount = 3;
    const insertValues = [];
    for (let position = 1; position <= wordCount; position += 1) {
      insertValues.push({
        setId: set.id,
        position,
        term: `word${position}`,
        meaning: `nghĩa ${position}`,
        example: `Example sentence ${position}.`,
        ipa: `/wɜːd${position}/`,
      });
    }
    await db.insert(words).values(insertValues);

    const api = createFakeGoogleWorkspaceApi();
    const result = await createGoogleSheetForSet(set.id, { userId: admin.id }, api, { aiEnrich: true });
    assert.ok(result.exportedRows >= wordCount, "every existing word must be exported");

    const grid = api.__inspect(result.spreadsheetId);
    assert.ok(grid, "the in-memory fake keeps the created spreadsheet");

    const exported = (await db.select().from(words).where((await import("drizzle-orm")).eq(words.setId, set.id)).orderBy(asc(words.position)));
    assert.equal(exported.length, wordCount, "the DB set is unchanged by sheet creation");

    // Header + wordCount exported rows must still hold the real vocabulary.
    for (let index = 0; index < wordCount; index += 1) {
      const row = grid.values[index + 1] ?? [];
      const joined = row.map((cell) => String(cell ?? "")).join("|");
      assert.ok(joined.includes(exported[index].term!), `exported row ${index + 2} must keep the term, got: ${joined}`);
      assert.ok(joined.includes(exported[index].meaning!), `exported row ${index + 2} must keep the meaning`);
    }

    // The formula buffer must start strictly AFTER the exported data.
    const meaningColumnIndex = (await import("@/lib/googleSheets/template")).getGoogleSheetTemplate(set).fields.findIndex((field) => field.key === "meaning");
    const meaningLetter = String.fromCharCode(65 + meaningColumnIndex);
    for (let index = 0; index < wordCount; index += 1) {
      const cell = grid.values[index + 1]?.[meaningColumnIndex];
      const text = String(cell ?? "");
      assert.ok(!text.startsWith("="), `${meaningLetter}${index + 2} must hold the exported meaning, not a raw formula (got "${text}")`);
    }
    const firstBufferRow = grid.values[wordCount + 1]?.[meaningColumnIndex];
    assert.ok(String(firstBufferRow ?? "").startsWith("="), `the first AI buffer row ${meaningLetter}${wordCount + 2} must be a formula`);

    // __lexora_id and STT stay system-managed, never AI.
    const template = (await import("@/lib/googleSheets/template")).getGoogleSheetTemplate(set);
    const sourceIndex = template.fields.findIndex((field) => field.key === "__lexora_id");
    for (let index = 0; index < wordCount; index += 1) {
      const cell = String(grid.values[index + 1]?.[sourceIndex] ?? "");
      assert.ok(!cell.startsWith("="), "identity column must never receive an AI formula");
    }
  } finally {
    try {
      await sql.begin(async (tx) => {
        if (setId) {
          await tx`delete from google_sheet_row_mappings where connection_id in (select id from google_sheet_connections where set_id=${setId})`;
          await tx`delete from google_sheet_sync_channels where connection_id in (select id from google_sheet_connections where set_id=${setId})`;
          await tx`delete from google_sheet_connections where set_id=${setId}`;
          await tx`delete from words where set_id=${setId}`;
          await tx`delete from vocab_sets where id=${setId}`;
        }
      });
    } finally {
      await sql.end();
    }
  }
});
