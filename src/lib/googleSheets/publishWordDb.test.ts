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
import { deleteWordsWithSheetSync } from "./deleteWords";

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
    api.batchUpdate = async () => { throw new Error("Google delete unavailable"); };
    await assert.rejects(deleteWordsWithSheetSync([word.id], api), /Google delete unavailable/);
    assert.equal((await db.select().from(words).where(eq(words.id, word.id))).length, 1);
    assert.equal((await db.select().from(googleSheetRowMappings).where(eq(googleSheetRowMappings.wordId, word.id))).length, 1);
    values.splice(1, 0, template.fields.map(field => field.key === "term" ? "unrelated" : field.key === "meaning" ? "keep" : field.key === "__lexora_id" ? "v_99999999" : ""));
    api.batchUpdate = async (_id, requests) => {
      for (const request of requests) {
        const range = (request as { deleteDimension: { range: { startIndex: number; endIndex: number } } }).deleteDimension.range;
        values.splice(range.startIndex, range.endIndex - range.startIndex);
      }
    };
    assert.equal((await deleteWordsWithSheetSync([word.id], api)).kind, "ok");
    assert.equal(values.length, 2);
    assert.ok(values[1].includes("unrelated"));
    assert.equal((await db.select().from(words).where(eq(words.id, word.id))).length, 0);
    const afterDelete = await db.transaction(tx => runVocabularySync(connection, gridFromValuesRange(values), tx));
    assert.equal(afterDelete.stats.rowsCreated, 1);
    assert.equal((await db.select().from(words).where(eq(words.setId, set.id))).some(row => row.term === "hello"), false);
    const [second] = await db.insert(words).values({ setId: set.id, position: 2, term: "bye", meaning: "tam biet" }).returning();
    api.appendValues = async () => { throw new Error("Google unavailable"); };
    assert.equal((await publishCreatedWord(second, api)).status, "error");
    assert.equal((await db.select().from(words).where(eq(words.id, second.id))).length, 1);
    assert.equal((await db.select().from(googleSheetRowMappings).where(eq(googleSheetRowMappings.wordId, second.id))).length, 0);
    values.push(template.fields.map(field => field.key === "meaning" ? '=AI("meaning";C3)' : ""));
    api.batchUpdate = async (_id, requests) => {
      for (const request of requests) {
        const range = (request as { insertDimension: { range: { startIndex: number } } }).insertDimension.range;
        values.splice(range.startIndex, 0, []);
      }
    };
    api.writeValues = async (_id, range, rows) => {
      const rowNumber = Number(range.match(/!A(\d+)/)![1]);
      values[rowNumber - 1] = rows[0];
    };
    assert.equal((await publishCreatedWord(second, api)).status, "synced");
    assert.ok(values[2].includes("bye"));
    assert.ok(values[3].some(value => String(value).startsWith("=AI(")));
    const [secondMapping] = await db.select().from(googleSheetRowMappings).where(eq(googleSheetRowMappings.wordId, second.id));
    assert.equal(secondMapping.sheetRowNumber, 3);
    await db.update(googleSheetConnections).set({ aiEnrich: true, aiPrompts: JSON.stringify({ ipa: "CUSTOM IPA" }) }).where(eq(googleSheetConnections.id, connection.id));
    const [third] = await db.insert(words).values({ setId: set.id, position: 3, term: "mitigate", meaning: "user meaning", example: "user example" }).returning();
    const aiWrites: string[] = [];
    api.batchWriteValues = async (_id, updates) => {
      for (const update of updates) {
        assert.equal(update.parseFormulas, true);
        aiWrites.push(update.rangeA1);
        const match = update.rangeA1.match(/!([A-Z]+)(\d+)/)!;
        const column = [...match[1]].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
        values[Number(match[2]) - 1][column] = update.values[0][0];
      }
    };
    assert.equal((await publishCreatedWord(third, api)).status, "synced");
    assert.ok(aiWrites.length > 0);
    const thirdRow = values.find(row => row.includes("mitigate"))!;
    assert.equal(thirdRow[template.fields.findIndex(field => field.key === "meaning")], "user meaning");
    assert.equal(thirdRow[template.fields.findIndex(field => field.key === "example")], "user example");
    assert.match(String(thirdRow[template.fields.findIndex(field => field.key === "ipa")]), /CUSTOM IPA/);
  } finally {
    await db.delete(vocabSets).where(eq(vocabSets.id, set.id));
  }
});
