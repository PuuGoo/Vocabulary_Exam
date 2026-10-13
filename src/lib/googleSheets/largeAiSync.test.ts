import assert from "node:assert/strict";
import test from "node:test";
import { getGoogleSheetTemplate, SOURCE_ID_HEADER } from "./template";
import { gridFromValuesRange } from "./parser";
import { fingerprintSheetValues } from "./fingerprint";
import { generateSourceId } from "./identity";
import { runVocabularySync, type SyncConnection, type SyncStats } from "./syncVocabulary";
import { scanPendingAiCells, resolvePendingAiRows } from "./aiPending";

function makeSourceId(index: number): string {
  return `v_${index.toString(16).padStart(10, "0")}`;
}

process.env.DATABASE_URL = "postgres://unused:unused@localhost:1/unused";

const FULL_STATS: SyncStats = {
  rowsRead: 0, rowsCreated: 0, rowsUpdated: 0, rowsUnchanged: 0, rowsDeleted: 0, rowsSkipped: 0,
  duplicateCount: 0, validationErrorCount: 0,
  aiPendingRowCount: 0, aiPendingRows: [], aiPendingCellCount: 0, aiPendingRetry: false,
  conflicts: [], changes: [], deletionBlocked: 0, invalidRows: [], idWrites: [], changedWordIds: [], unarchivedWordIds: [],
};

/**
 * Build a Sheet grid for N rows. `pending` holds the row indexes whose AI
 * columns (Meaning / Example) are still holding a raw =AI() formula.
 */
function gridFor(rowCount: number, template: ReturnType<typeof getGoogleSheetTemplate>, options?: {
  pending?: readonly number[];
  blankMeaning?: readonly number[];
  sourceIds?: readonly string[];
}) {
  const header = template.fields.map((field) => field.header);
  const rows = Array.from({ length: rowCount }, (_, index) => template.fields.map((field, columnIndex) => {
    if (field.key === SOURCE_ID_HEADER) return options?.sourceIds?.[index] ?? makeSourceId(index);
    if (field.displayOnly) return String(index + 1);
    if (field.key === "term") return `word${index}`;
    if (field.key === "meaning") {
      if (options?.pending?.includes(index)) return `=AI("give the meaning";C${index + 2})`;
      return options?.blankMeaning?.includes(index) ? "" : `meaning ${index}`;
    }
    if (field.key === "example") {
      if (options?.pending?.includes(index)) return `=AI("write an example";C${index + 2})`;
      return `example ${index}`;
    }
    return "";
  }));
  return gridFromValuesRange([header, ...rows]);
}

function makeTx(words: Array<Record<string, unknown>>, mappings: Array<Record<string, unknown>>, set: Record<string, unknown>) {
  const inserted: Array<Record<string, unknown>> = [];
  const updated: Array<Record<string, unknown>> = [];
  const tx = {
    execute: async () => [],
    select: () => ({ from: (table: unknown) => ({ where: () => ({
      limit: async () => [set],
      orderBy: () => ({ for: async () => words, limit: async () => [{ position: words.length }] }),
      then: (resolve: (rows: unknown[]) => void) => resolve(table === (mappings as unknown) ? mappings : words),
    }) }) }),
    insert: (table: unknown) => ({ values: (values: Record<string, unknown> | Record<string, unknown>[]) => ({ returning: async () => {
      const batch = (Array.isArray(values) ? values : [values]) as Array<Record<string, unknown>>;
      inserted.push(...batch);
      return batch.map((value, index) => ({ id: 9000 + inserted.length + index, ...value }));
    } }) }),
    update: (table: unknown) => ({ set: (values: Record<string, unknown>) => ({ where: async () => { updated.push(values); } }) }),
  };
  return { tx, inserted, updated };
}

function fixture(rowCount: number, gridOptions?: Parameters<typeof gridFor>[2]) {
  const set = { id: 1, name: "Regression", type: "ielts_vocab", languageCode: "en" };
  const template = getGoogleSheetTemplate(set);
  const sourceIds = Array.from({ length: rowCount }, (_, index) => makeSourceId(index));
  const words = Array.from({ length: rowCount }, (_, index) => ({ id: index + 1, setId: 1, position: index + 1, term: `word${index}`, meaning: `meaning ${index}`, example: `example ${index}` }));
  const mappings = words.map((word, index) => ({
    id: index + 1, connectionId: 1, wordId: word.id, sourceId: sourceIds[index], sheetRowNumber: index + 2,
    sourceFingerprint: fingerprintSheetValues(template, { term: word.term, meaning: word.meaning, example: word.example }),
    lastSyncedFingerprint: fingerprintSheetValues(template, { term: word.term, meaning: word.meaning, example: word.example }),
    deletedAt: null,
  }));
  const connection: SyncConnection = {
    id: 1, setId: 1, spreadsheetId: "sheet", sheetTitle: template.sheetTitle,
    deleteBehavior: "archive", conflictPolicy: "review", status: "connected", enabled: true,
  };
  const grid = gridFor(rowCount, template, { sourceIds, ...gridOptions });
  // The FORMULA view of the same read: the pending AI formulas are visible there.
  const formulas = [template.fields.map((field) => field.header), ...grid.rows.map((row, index) => {
    const pending = gridOptions?.pending?.includes(index) ?? false;
    return row.map((cell, columnIndex) => {
      const key = template.fields[columnIndex]?.key;
      if (pending && (key === "meaning" || key === "example")) return `=AI("pending";C${index + 2})`;
      return cell;
    });
  })];
  return { set, template, connection, grid, formulas, sourceIds, words, mappings };
}

async function run(rowCount: number, gridOptions?: Parameters<typeof gridFor>[2], engineOptions?: Parameters<typeof runVocabularySync>[3]) {
  const state = fixture(rowCount, gridOptions);
  const pending = scanPendingAiCells(state.formulas);
  const { tx, inserted, updated } = makeTx(state.words, state.mappings, state.set);
  const { stats } = await runVocabularySync(state.connection, state.grid, tx as never, engineOptions, { rowNumbers: pending.rows, cellCount: pending.cellCount });
  return { stats, inserted, updated, state };
}

test("scanPendingAiCells distinguishes generated, pending and empty cells", () => {
  const scan = scanPendingAiCells([["Word", "Meaning"], ["abandon", "reject"]]);
  assert.deepEqual(scan.rows, []);
  assert.equal(scan.cellCount, 0);

  const generating = scanPendingAiCells([["Word", "Meaning"], ["abandon", '=AI("m";A2)'], ["erase", ""]]);
  assert.deepEqual(generating.rows, [2]);
  assert.equal(generating.cellCount, 1);
  assert.deepEqual(generating.cellsByColumn.get(1), 1);

  const gemini = scanPendingAiCells([["h"], ['=Gemini("m";A2)']]);
  assert.deepEqual(gemini.rows, [2], "=Gemini() is a pending AI cell too");
  assert.equal(scanPendingAiCells(undefined).cellCount, 0);
  assert.equal(scanPendingAiCells([["h"]]).rows.length, 0, "a header-only sheet has no pending rows");
});

test("resolvePendingAiRows drops rows that no longer exist in the grid", () => {
  const parsed = [{ rowNumber: 2 }, { rowNumber: 5 }];
  assert.deepEqual([...resolvePendingAiRows({ rowNumbers: [2, 3, 99] }, parsed)].sort(), [2]);
  assert.equal(resolvePendingAiRows(undefined, parsed).size, 0);
});

test("10 rows: all sync when AI finished", async () => {
  const { stats } = await run(10);
  assert.equal(stats.rowsRead, 10);
  assert.equal(stats.rowsUnchanged, 10);
  assert.equal(stats.rowsCreated, 0);
  assert.equal(stats.rowsUpdated, 0);
  assert.equal(stats.invalidRows.length, 0);
  assert.equal(stats.aiPendingRowCount, 0);
  assert.equal(stats.aiPendingRetry, false);
});

test("11 rows: no hidden cap appears at row 11", async () => {
  const { stats } = await run(11);
  assert.equal(stats.rowsRead, 11);
  assert.equal(stats.rowsUnchanged, 11);
  assert.equal(stats.invalidRows.length, 0);
  assert.equal(stats.aiPendingRetry, false);
});

test("20 rows: exact statistics", async () => {
  const { stats } = await run(20);
  assert.deepEqual(
    { read: stats.rowsRead, created: stats.rowsCreated, updated: stats.rowsUpdated, unchanged: stats.rowsUnchanged, deleted: stats.rowsDeleted, skipped: stats.rowsSkipped, dupes: stats.duplicateCount, invalid: stats.validationErrorCount },
    { read: 20, created: 0, updated: 0, unchanged: 20, deleted: 0, skipped: 0, dupes: 0, invalid: 0 },
  );
});

test("70 rows: all processed when every AI cell is ready", async () => {
  const { stats } = await run(70);
  assert.equal(stats.rowsRead, 70, "all 70 rows are read");
  assert.equal(stats.rowsUnchanged, 70, "all 70 rows sync");
  assert.equal(stats.rowsCreated, 0);
  assert.equal(stats.invalidRows.length, 0);
  assert.equal(stats.duplicateCount, 0);
  assert.equal(stats.conflicts.length, 0);
  assert.equal(stats.aiPendingRetry, false);
});

test("70 rows: unfinished AI cells are pending, never persisted or archived", async () => {
  const pending = Array.from({ length: 70 }, (_, index) => index);
  const { stats, updated } = await run(70, { pending });
  assert.equal(stats.rowsRead, 70);
  assert.equal(stats.aiPendingRowCount, 70, "every unfinished row is reported");
  assert.equal(stats.aiPendingRows[0], 2, "the first data row is Sheet row 2");
  assert.equal(stats.aiPendingRows.at(-1), 71, "the last data row is Sheet row 71");
  assert.equal(stats.aiPendingCellCount, 140, "two AI columns per row");
  assert.equal(stats.aiPendingRetry, true, "the run must be retried");
  // Nothing half-generated may reach the database.
  assert.equal(stats.rowsCreated, 0, "no temporary row is written");
  assert.equal(stats.rowsUpdated, 0, "no temporary value is written");
  assert.equal(stats.invalidRows.length, 0, "a generating row is not a validation error");
  assert.equal(stats.validationErrorCount, 0, "a generating row is not a validation error");
  // Unfinished rows must never be treated as missing/deleted rows.
  assert.equal(stats.rowsDeleted, 0, "a generating row is not a deleted row");
  assert.equal(stats.deletionBlocked, 0, "a generating row must not trigger archive review");
  assert.equal(stats.deletionReview, undefined);
  assert.equal(updated.filter((values) => values.deletedAt instanceof Date).length, 0, "no word is archived");
});

test("70 rows: a mix of ready and generating rows keeps the ready ones synced", async () => {
  // The last 30 rows are still generating; the first 40 are finished.
  const pending = Array.from({ length: 30 }, (_, index) => index + 40);
  const { stats } = await run(70, { pending });
  assert.equal(stats.rowsRead, 70);
  assert.equal(stats.rowsUnchanged, 40, "the 40 finished rows still sync");
  assert.equal(stats.aiPendingRowCount, 30, "the 30 generating rows are pending");
  assert.deepEqual(stats.aiPendingRows, Array.from({ length: 30 }, (_, index) => index + 42));
  assert.equal(stats.rowsCreated, 0);
});

test("70 rows: one genuinely invalid row is reported with its real row number", async () => {
  // Row 36 (index 34) loses both Word and Meaning because the admin deleted
  // them. That is a real error, distinct from an AI cell still generating.
  const state = fixture(70);
  state.grid.rows[34][2] = ""; // Word column
  state.grid.rows[34][3] = ""; // Meaning column
  const { tx } = makeTx(state.words, state.mappings, state.set);
  const { stats } = await runVocabularySync(state.connection, state.grid, tx as never);
  assert.equal(stats.rowsRead, 70);
  assert.equal(stats.invalidRows.length, 1, "only the broken row is rejected");
  assert.equal(stats.invalidRows[0].rowNumber, 36, "the reported row number is the real Sheet row");
  assert.equal(stats.validationErrorCount, 1);
  assert.equal(stats.rowsUnchanged, 69, "the other 69 rows still sync");
  assert.equal(stats.rowsCreated, 0, "no duplicate word is created");
  assert.equal(stats.rowsDeleted, 0, "a broken row is not silently deleted");
});

test("70 rows repeated sync never duplicates vocabulary", async () => {
  const state = fixture(70);
  const pending = scanPendingAiCells(state.formulas);
  // Both passes read the very same Sheet snapshot.
  const first = await runVocabularySync(state.connection, state.grid, makeTx(state.words, state.mappings, state.set).tx as never, undefined, { rowNumbers: pending.rows, cellCount: pending.cellCount });
  assert.equal(first.stats.rowsUnchanged, 70, "the first pass syncs every row");
  assert.equal(first.stats.rowsCreated, 0);
  const second = await runVocabularySync(state.connection, state.grid, makeTx(state.words, state.mappings, state.set).tx as never, undefined, { rowNumbers: pending.rows, cellCount: pending.cellCount });
  assert.equal(second.stats.rowsCreated, 0, "a repeat sync creates nothing");
  assert.equal(second.stats.rowsUpdated, 0, "a repeat sync updates nothing");
  assert.equal(second.stats.rowsUnchanged, 70, "a repeat sync is idempotent");
  assert.equal(second.stats.idWrites.length, 0, "no id is rewritten for rows that already have one");
});

test("70 rows with moved columns still map to the same identity", async () => {
  const state = fixture(70);
  const order = [3, 0, 2, 1, 5, 12, 4, 9, 15, 6, 7, 8, 10, 11, 13, 14];
  const reordered = gridFromValuesRange([
    order.map((index) => state.template.fields.map((field) => field.header)[index]),
    ...state.grid.rows.map((row) => order.map((index) => row[index] ?? "")),
  ]);
  const { tx } = makeTx(state.words, state.mappings, state.set);
  const { stats } = await runVocabularySync(state.connection, reordered, tx as never);
  assert.equal(stats.rowsRead, 70, "no row is lost when columns move");
  assert.equal(stats.invalidRows.length, 0);
  assert.equal(stats.conflicts.length, 0, "identity follows __lexora_id, not the column position");
  assert.equal(stats.rowsUnchanged, 70);
});

test("unfinished AI output must be reflected in the run status", async () => {
  const { stats } = await run(70, { pending: [0, 1, 2] });
  assert.equal(stats.aiPendingRetry, true);
  const done = await run(70);
  assert.equal(done.stats.aiPendingRetry, false);
});