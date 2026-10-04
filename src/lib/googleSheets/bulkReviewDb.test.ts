import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { googleSheetConnections, googleSheetRowMappings, vocabSets, words } from "@/db/schema";
import { getGoogleSheetTemplate, SOURCE_ID_HEADER } from "./template";
import { fingerprintDbWord } from "./fingerprint";
import { runVocabularySync } from "./syncVocabulary";
import { gridFromValuesRange } from "./parser";

test("mixed create/update and blocked deletion produces an immediately usable review", { skip: process.env.GOOGLE_SHEETS_TEST_DB !== "1" }, async () => {
  const [set] = await db.insert(vocabSets).values({ name: "mixed-bulk-review", type: "ielts_vocab" }).returning();
  try {
    const template = getGoogleSheetTemplate(set);
    const [connection] = await db.insert(googleSheetConnections).values({ setId: set.id, spreadsheetId: `bulk-${set.id}`, spreadsheetUrl: "u", spreadsheetName: "n", sheetId: 0, sheetTitle: template.sheetTitle, rangeA1: "A:Z", templateType: template.templateType, aiEnrich: false }).returning();
    const existing = await db.insert(words).values(Array.from({ length: 6 }, (_, index) => ({ setId: set.id, position: index + 1, term: `term${index}`, meaning: "meaning", example: "old" }))).returning();
    await db.insert(googleSheetRowMappings).values(existing.map((word, index) => ({ connectionId: connection.id, wordId: word.id, sourceId: `v_0000000${index}`, sheetRowNumber: index + 2, sourceFingerprint: fingerprintDbWord(template, word), lastSyncedFingerprint: fingerprintDbWord(template, word) })));
    const row = (values: Record<string, string>) => template.fields.map(field => values[field.key] ?? "");
    const grid = gridFromValuesRange([template.fields.map(field => field.header), row({ [SOURCE_ID_HEADER]: "v_00000000", term: "term0", meaning: "meaning", example: "edited" }), row({ term: "newterm", meaning: "new meaning", example: "new example" })]);
    const preview = await db.transaction(tx => runVocabularySync(connection, grid, tx));
    assert.equal(preview.stats.rowsCreated, 1);
    assert.equal(preview.stats.rowsUpdated, 1);
    assert.equal(preview.stats.deletionBlocked, 5);
    const idColumn = template.fields.findIndex(field => field.key === SOURCE_ID_HEADER);
    for (const write of preview.stats.idWrites) grid.rows[write.rowNumber - 2][idColumn] = write.sourceId;
    const confirmed = await db.transaction(tx => runVocabularySync(connection, grid, tx, { deletionApproval: preview.stats.deletionReview!.fingerprint }));
    assert.equal(confirmed.stats.rowsDeleted, 5);
    assert.equal(confirmed.stats.rowsCreated, 0);
    assert.equal(confirmed.stats.rowsUpdated, 0);
    assert.equal((await db.select().from(words).where(eq(words.setId, set.id))).length, 7);
  } finally {
    await db.delete(vocabSets).where(eq(vocabSets.id, set.id));
  }
});
