import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, vocabSets, words, googleSheetConnections, googleSheetRowMappings } from "@/db/schema";
import { createFakeGoogleWorkspaceApi } from "./api";
import { getGoogleSheetTemplate } from "./template";
import { editWordWithSheetSync } from "./editWord";
import { fingerprintDbWord } from "./fingerprint";
import { runVocabularySync } from "./syncVocabulary";
import { gridFromValuesRange } from "./parser";

test("web editing writes only changed cells, survives reordered columns and preserves webhook identity", { skip: process.env.GOOGLE_SHEETS_TEST_DB !== "1" }, async () => {
  const [owner] = await db.select().from(users).limit(1);
  const [set] = await db.insert(vocabSets).values({ name: "edit-sync-test", type: "ielts_vocab" }).returning();
  try {
    const template = getGoogleSheetTemplate(set);
    const [word] = await db.insert(words).values({ setId: set.id, position: 1, term: "hello", meaning: "meaning", example: "old" }).returning();
    const [connection] = await db.insert(googleSheetConnections).values({ setId: set.id, createdBy: owner.id, spreadsheetId: `edit-${set.id}`, spreadsheetUrl: "u", spreadsheetName: "n", sheetId: 0, sheetTitle: "Renamed", rangeA1: "A:Z", templateType: template.templateType }).returning();
    const baseline = fingerprintDbWord(template, word);
    await db.insert(googleSheetRowMappings).values({ connectionId: connection.id, wordId: word.id, sourceId: "v_12345678", sheetRowNumber: 99, sourceFingerprint: baseline, lastSyncedFingerprint: baseline });
    const fields = [...template.fields].reverse();
    const values = [fields.map(field => field.header), fields.map(field => field.key === "__lexora_id" ? "v_12345678" : String((word as Record<string, unknown>)[field.key] ?? ""))];
    let written = 0;
    const api = createFakeGoogleWorkspaceApi({
      getSpreadsheetMetadata: async () => ({ sheets: [{ sheetId: 0, title: "Renamed" }] }),
      readValues: async () => structuredClone(values),
      batchWriteValues: async (_id, updates) => {
        written += updates.length;
        for (const update of updates) {
          assert.equal(update.parseFormulas, false);
          const match = update.rangeA1.match(/!([A-Z]+)(\d+)$/)!;
          const column = [...match[1]].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
          values[Number(match[2]) - 1][column] = String(update.values[0][0]);
        }
      },
    });
    const updated = await editWordWithSheetSync(word.id, { meaning: "meaning", example: "web edit" }, api);
    assert.equal(updated.example, "web edit");
    assert.equal(written, 1);
    assert.equal(values[1][fields.findIndex(field => field.key === "example")], "web edit");
    const synced = await db.transaction(tx => runVocabularySync(connection, gridFromValuesRange(values), tx));
    assert.equal(synced.stats.rowsCreated, 0);
    assert.equal(synced.stats.rowsUpdated, 0);
    assert.equal(synced.stats.conflicts.length, 0);
    api.batchWriteValues = async () => { throw new Error("Google down"); };
    await assert.rejects(editWordWithSheetSync(word.id, { example: "must not save" }, api));
    assert.equal((await db.select().from(words).where(eq(words.id, word.id)))[0].example, "web edit");
    values[1][fields.findIndex(field => field.key === "meaning")] = "concurrent Sheet edit";
    await assert.rejects(editWordWithSheetSync(word.id, { example: "conflicting" }, api), /chưa đồng bộ/);
  } finally { await db.delete(vocabSets).where(eq(vocabSets.id, set.id)); }
});
