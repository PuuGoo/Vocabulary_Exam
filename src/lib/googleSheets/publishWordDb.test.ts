import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { googleSheetConnections, googleSheetRowMappings, users, vocabSets, words } from "@/db/schema";
import { createFakeGoogleWorkspaceApi } from "./api";
import { getGoogleSheetTemplate } from "./template";
import { publishCreatedWord } from "./publishWord";
import { runVocabularySync } from "./syncVocabulary";
import { gridFromValuesRange } from "./parser";

test("web-created word appends once and webhook keeps the same database identity", { skip: process.env.GOOGLE_SHEETS_TEST_DB !== "1" }, async () => {
  const [owner] = await db.select().from(users).limit(1);
  const [set] = await db.insert(vocabSets).values({ name: "publish-word-test", type: "ielts_vocab" }).returning();
  try {
    const template = getGoogleSheetTemplate(set);
    const [connection] = await db.insert(googleSheetConnections).values({ setId: set.id, createdBy: owner.id, spreadsheetId: `publish-${set.id}`, spreadsheetUrl: "u", spreadsheetName: "n", sheetId: 0, sheetTitle: template.sheetTitle, rangeA1: "A:Z", templateType: template.templateType, aiEnrich: false }).returning();
    const [word] = await db.insert(words).values({ setId: set.id, position: 1, term: "hello", meaning: "xin chao", example: "web example" }).returning();
    const values: (string | number | boolean | null)[][] = [template.fields.map(field => field.header)];
    let appends = 0;
    const api = createFakeGoogleWorkspaceApi({
      getSpreadsheetMetadata: async () => ({ sheets: [{ sheetId: 0, title: template.sheetTitle }] }),
      readValues: async () => values,
      appendValues: async (_id, _range, rows) => { appends += 1; const start = values.length + 1; values.push(...rows); return start; },
    });
    assert.equal((await publishCreatedWord(word, api)).status, "synced");
    assert.equal((await publishCreatedWord(word, api)).status, "synced");
    assert.equal(appends, 1);
    const [mapping] = await db.select().from(googleSheetRowMappings).where(eq(googleSheetRowMappings.wordId, word.id));
    assert.equal(mapping.sheetRowNumber, 2);
    const result = await db.transaction(tx => runVocabularySync(connection, gridFromValuesRange(values), tx));
    assert.equal(result.stats.rowsCreated, 0);
    assert.equal(result.stats.rowsUpdated, 0);
    assert.equal(result.stats.conflicts.length, 0);
    const [second] = await db.insert(words).values({ setId: set.id, position: 2, term: "bye", meaning: "tam biet" }).returning();
    api.appendValues = async () => { throw new Error("Google unavailable"); };
    assert.equal((await publishCreatedWord(second, api)).status, "error");
    assert.equal((await db.select().from(words).where(eq(words.id, second.id))).length, 1);
    assert.equal((await db.select().from(googleSheetRowMappings).where(eq(googleSheetRowMappings.wordId, second.id))).length, 0);
  } finally {
    await db.delete(vocabSets).where(eq(vocabSets.id, set.id));
  }
});
