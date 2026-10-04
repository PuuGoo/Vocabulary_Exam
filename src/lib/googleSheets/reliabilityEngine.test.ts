import assert from "node:assert/strict";
import test from "node:test";
import { getGoogleSheetTemplate, SOURCE_ID_HEADER } from "./template";
import { fingerprintDbWord } from "./fingerprint";
import { gridFromValuesRange } from "./parser";

process.env.DATABASE_URL = "postgres://unused:unused@localhost:1/unused";

async function fixture() {
  const { runVocabularySync } = await import("./syncVocabulary");
  const { words, googleSheetRowMappings } = await import("@/db/schema");
  const set = { id: 1, type: "ielts_vocab", languageCode: "en" };
  const template = getGoogleSheetTemplate(set);
  const word = { id: 1, setId: 1, term: "hello", meaning: "xin chao", example: "website", position: 1, alternateTerm: "preserve me" };
  const mapping = { id: 1, connectionId: 1, wordId: 1, sourceId: "v_12345678", lastSyncedFingerprint: "old", sourceFingerprint: "old", deletedAt: null };
  const connection = { id: 1, setId: 1, spreadsheetId: "unused", sheetTitle: template.sheetTitle, deleteBehavior: "archive", enabled: true, status: "connected", conflictPolicy: "review" };
  const updates: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const tx = {
    select: () => ({ from: (table: unknown) => ({ where: () => ({ limit: async () => [set], orderBy: () => ({ for: async () => [word] }), then: (resolve: (rows: unknown[]) => void) => resolve(table === googleSheetRowMappings ? [mapping] : [word]) }) }) }),
    update: (table: unknown) => ({ set: (values: Record<string, unknown>) => ({ where: async () => { updates.push({ table, values }); } }) }),
  };
  const grid = (values: Record<string, string> = { term: "hello", meaning: "xin chao", example: "sheet" }) => gridFromValuesRange([template.fields.map(field => field.header), template.fields.map(field => field.key === SOURCE_ID_HEADER ? mapping.sourceId : values[field.key] ?? "")]);
  const run = (values = grid(), options?: Parameters<typeof runVocabularySync>[3]) => runVocabularySync(connection, values, tx as never, options);
  return { run, grid, updates, words, word, mapping, connection, template };
}

test("conflict captures both versions; exact resolution updates only sheet columns", async () => {
  const current = await fixture();
  const first = await current.run();
  assert.equal(first.stats.conflicts.length, 1);
  assert.equal(first.stats.rowsUpdated, 0);
  const conflict = first.stats.conflicts[0];
  assert.equal(conflict.before.example, "website");
  assert.equal(conflict.after.example, "sheet");
  const result = await current.run(current.grid(), { resolutions: [{ ...conflict, choice: "sheet" }] });
  assert.equal(result.stats.rowsUpdated, 1);
  assert.equal(result.stats.changes[0].before.example, "website");
  const patch = current.updates.find(item => item.table === current.words)!.values;
  assert.equal(patch.example, "sheet");
  assert.equal(Object.hasOwn(patch, "alternateTerm"), false);
});

test("stale conflict decisions are rejected instead of silently overwriting", async () => {
  const current = await fixture();
  const { stats } = await current.run();
  await assert.rejects(current.run(current.grid({ term: "hello", meaning: "xin chao", example: "newer" }), { resolutions: [{ ...stats.conflicts[0], choice: "sheet" }] }), /Dữ liệu đã thay đổi/);
  assert.equal(current.updates.length, 0);
});

test("sheet policy resolves a divergent row and keeps before values", async () => {
  const current = await fixture();
  current.connection.conflictPolicy = "sheet";
  const { stats } = await current.run();
  assert.equal(stats.conflicts.length, 0);
  assert.equal(stats.rowsUpdated, 1);
  assert.equal(stats.changes[0].before.example, "website");
});

test("keeping website acknowledges just this Sheet version", async () => {
  const current = await fixture();
  const conflict = (await current.run()).stats.conflicts[0];
  const result = await current.run(current.grid(), { resolutions: [{ ...conflict, choice: "website" }] });
  assert.equal(result.stats.rowsUpdated, 0);
  assert.equal(current.updates.some(item => item.table === current.words), false);
  Object.assign(current.mapping, current.updates[0].values);
  assert.equal((await current.run()).stats.rowsUpdated, 0);
  assert.equal((await current.run(current.grid({ term: "hello", meaning: "xin chao", example: "new sheet edit" }))).stats.rowsUpdated, 1);
});

test("empty Sheet blocks all-row archive; invalid existing row stays visible", async () => {
  const current = await fixture();
  const empty = gridFromValuesRange([current.template.fields.map(field => field.header)]);
  assert.equal((await current.run(empty)).stats.deletionBlocked, 1);
  assert.equal(current.updates.length, 0);
  const invalid = await current.run(current.grid({ term: "", meaning: "", example: "incomplete" }));
  assert.equal(invalid.stats.rowsDeleted, 0);
  assert.equal(current.updates.length, 0);
});

test("equal content repairs an old baseline without reporting a conflict", async () => {
  const current = await fixture();
  current.word.example = "sheet";
  const result = await current.run();
  assert.equal(result.stats.conflicts.length, 0);
  assert.equal(result.stats.rowsUpdated, 0);
  assert.equal(current.updates[0].values.lastSyncedFingerprint, fingerprintDbWord(current.template, current.word));
});
