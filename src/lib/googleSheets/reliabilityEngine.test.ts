import assert from "node:assert/strict";
import test from "node:test";
import { getGoogleSheetTemplate, SOURCE_ID_HEADER } from "./template";
import { fingerprintDbWord } from "./fingerprint";
import { gridFromValuesRange } from "./parser";

process.env.DATABASE_URL = "postgres://unused:unused@localhost:1/unused";

async function fixture(withMapping = true) {
  const { runVocabularySync } = await import("./syncVocabulary");
  const { words, googleSheetRowMappings } = await import("@/db/schema");
  const set = { id: 1, type: "ielts_vocab", languageCode: "en" };
  const template = getGoogleSheetTemplate(set);
  const word = { id: 1, setId: 1, term: "hello", meaning: "xin chao", example: "website", position: 1, alternateTerm: "preserve me" };
  const mapping = { id: 1, connectionId: 1, wordId: 1, sourceId: "v_12345678", lastSyncedFingerprint: "old", sourceFingerprint: "old", deletedAt: null };
  const connection = { id: 1, setId: 1, spreadsheetId: "unused", sheetTitle: template.sheetTitle, deleteBehavior: "archive", enabled: true, status: "connected", conflictPolicy: "review" };
  const updates: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const insertedMappings: Array<Record<string, unknown>> = [];
  const tx = {
    execute: async () => [],
    select: () => ({ from: (table: unknown) => ({ where: () => ({ limit: async () => [set], orderBy: () => ({ for: async () => [word] }), then: (resolve: (rows: unknown[]) => void) => resolve(table === googleSheetRowMappings ? (withMapping ? [mapping] : []) : [word]) }) }) }),
    insert: () => ({ values: (values: Record<string, unknown>) => ({ returning: async () => { insertedMappings.push(values); return [{ id: 2, ...values, deletedAt: null }]; } }) }),
    update: (table: unknown) => ({ set: (values: Record<string, unknown>) => ({ where: async () => { updates.push({ table, values }); } }) }),
  };
  const grid = (values: Record<string, string> = { term: "hello", meaning: "xin chao", example: "sheet" }) => gridFromValuesRange([template.fields.map(field => field.header), template.fields.map(field => field.key === SOURCE_ID_HEADER ? mapping.sourceId : values[field.key] ?? "")]);
  const run = (values = grid(), options?: Parameters<typeof runVocabularySync>[3]) => runVocabularySync(connection, values, tx as never, options);
  return { run, grid, updates, insertedMappings, words, word, mapping, connection, template };
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

test("reviewed bulk archive applies only the exact inspected snapshot", async () => {
  const current = await fixture();
  const empty = gridFromValuesRange([current.template.fields.map(field => field.header)]);
  const preview = (await current.run(empty)).stats;
  assert.equal(preview.deletionBlocked, 1);
  assert.equal(preview.deletionReview?.rows[0].wordId, current.word.id);
  const approved = await current.run(empty, { deletionApproval: preview.deletionReview!.fingerprint });
  assert.equal(approved.stats.deletionBlocked, 0);
  assert.equal(approved.stats.rowsDeleted, 1);
  assert.equal(approved.stats.changes[0].before.example, "website");
});

test("bulk approval is rejected before writes when the database or Sheet changed", async () => {
  const current = await fixture();
  const empty = gridFromValuesRange([current.template.fields.map(field => field.header)]);
  const preview = (await current.run(empty)).stats.deletionReview!;
  current.word.example = "new website edit";
  await assert.rejects(current.run(empty, { deletionApproval: preview.fingerprint }), /Dữ liệu đã thay đổi/);
  assert.equal(current.updates.length, 0);
});

test("delete policy removes visibility without deleting words or cascading learning records", async () => {
  const current = await fixture();
  current.connection.deleteBehavior = "delete";
  const empty = gridFromValuesRange([current.template.fields.map(field => field.header)]);
  const review = (await current.run(empty)).stats.deletionReview!;
  const result = await current.run(empty, { deletionApproval: review.fingerprint });
  assert.equal(result.stats.rowsDeleted, 1);
  assert.equal(result.stats.changes[0].action, "delete");
  assert.deepEqual(result.stats.changedWordIds, [current.word.id]);
  assert.equal(current.updates.some(update => update.table === current.words), false);
  assert.ok(current.updates.some(update => update.values.deletedAt instanceof Date));
});

test("missing Sheet ID reuses the existing mapping instead of archiving its word", async () => {
  const current = await fixture();
  current.connection.conflictPolicy = "sheet";
  const grid = current.grid();
  grid.rows[0][current.template.fields.findIndex(field => field.key === SOURCE_ID_HEADER)] = "";
  const result = await current.run(grid);
  assert.deepEqual(result.stats.idWrites, [{ rowNumber: 2, sourceId: current.mapping.sourceId }]);
  assert.equal(result.stats.rowsDeleted, 0);
  assert.equal(result.stats.deletionBlocked, 0);
  assert.equal(result.stats.rowsUpdated, 1);
});

test("changing a mapped word's source ID is rejected without writes", async () => {
  const current = await fixture();
  const grid = current.grid();
  grid.rows[0][current.template.fields.findIndex(field => field.key === SOURCE_ID_HEADER)] = "v_87654321";
  await assert.rejects(current.run(grid), /ID trên Sheet khác/);
  assert.equal(current.updates.length, 0);
});

test("fallback existing word gains a real mapping without recreating the word", async () => {
  const current = await fixture(false);
  const result = await current.run();
  assert.equal(result.stats.rowsCreated, 0);
  assert.equal(result.stats.rowsUpdated, 1);
  assert.equal(current.insertedMappings.length, 1);
  assert.equal(current.insertedMappings[0].wordId, current.word.id);
  assert.equal(current.insertedMappings[0].sourceId, current.mapping.sourceId);
  assert.equal(result.stats.deletionBlocked, 0);
});

test("invalid nonempty ID is not silently replaced", async () => {
  const current = await fixture();
  const grid = current.grid();
  grid.rows[0][current.template.fields.findIndex(field => field.key === SOURCE_ID_HEADER)] = "invalid";
  await assert.rejects(current.run(grid), /ID dòng không hợp lệ/);
  assert.equal(current.updates.length, 0);
});

test("large updates wait for version-bound approval and preserve before/after review", async () => {
  const previousMinimum = process.env.GOOGLE_SHEETS_BULK_UPDATE_MIN_ROWS;
  process.env.GOOGLE_SHEETS_BULK_UPDATE_MIN_ROWS = "1";
  try {
    const current = await fixture();
    current.connection.conflictPolicy = "sheet";
    const preview = (await current.run()).stats;
    assert.equal(preview.rowsUpdated, 0);
    assert.equal(preview.updateBlocked, 1);
    assert.equal(preview.updateReview?.rows[0].before.example, "website");
    assert.equal(preview.updateReview?.rows[0].after.example, "sheet");
    assert.equal(current.updates.length, 0);
    const approved = await current.run(current.grid(), { updateApproval: preview.updateReview!.fingerprint });
    assert.equal(approved.stats.rowsUpdated, 1);
    assert.equal(approved.stats.updateBlocked, 0);
    await assert.rejects(current.run(current.grid({ term: "hello", meaning: "xin chao", example: "newer" }), { updateApproval: preview.updateReview!.fingerprint }), /Dữ liệu đã thay đổi/);
  } finally {
    if (previousMinimum === undefined) delete process.env.GOOGLE_SHEETS_BULK_UPDATE_MIN_ROWS;
    else process.env.GOOGLE_SHEETS_BULK_UPDATE_MIN_ROWS = previousMinimum;
  }
});
