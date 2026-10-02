import assert from "node:assert/strict";
import test from "node:test";
import { getGoogleSheetTemplate, SOURCE_ID_HEADER, STT_FIELD_KEY, type GoogleSheetTemplate } from "@/lib/googleSheets/template";
import { buildRangeA1 } from "@/lib/googleSheets/spreadsheet";
import { computeWordFingerprint } from "@/lib/googleSheets/fingerprint";
import { generateSourceId, readSourceIdCell } from "@/lib/googleSheets/identity";
import { gridFromValuesRange, parseSheetGrid } from "@/lib/googleSheets/parser";
import { parseVocabularyRows } from "@/lib/vocabImport/parse";
import { importWordKey } from "@/lib/importDedup";
import { createFakeGoogleWorkspaceApi } from "@/lib/googleSheets/api";

type FakeWord = { id: number; setId: number; position: number; term: string | null; meaning: string };

function wordToValues(template: GoogleSheetTemplate, word: FakeWord): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of template.fields) {
    if (field.key === SOURCE_ID_HEADER || field.displayOnly) continue;
    const value = (word as unknown as Record<string, unknown>)[field.key];
    values[field.key] = value == null ? "" : String(value);
  }
  return values;
}

function blankRow(width: number): string[] {
  return Array.from({ length: width }, () => "");
}

/**
 * Acceptance scenario over the pure sync pipeline (the DB transaction layer is
 * covered by the architecture test + a real deployment):
 * create set -> export words -> admin adds "mitigate" -> sync detects it and
 * mints __lexora_id -> admin edits Meaning -> same wordId updates -> reorder
 * rows -> identity unchanged.
 */
test("acceptance: create sheet, add row, edit meaning and reorder keep one identity", async () => {
  const set = { id: 123, type: "ielts_vocab", languageCode: "en", name: "IELTS Unit 01" };
  const words: FakeWord[] = [
    { id: 1, setId: 123, position: 1, term: "abandon", meaning: "từ bỏ" },
    { id: 2, setId: 123, position: 2, term: "acquire", meaning: "đạt được" },
    { id: 3, setId: 123, position: 3, term: "facilitate", meaning: "tạo điều kiện" },
  ];
  const template = getGoogleSheetTemplate(set);
  const api = createFakeGoogleWorkspaceApi();
  const spreadsheetId = "fake-initial";
  const width = template.fields.length;

  // 1. Lexora exports current vocabulary with freshly minted source IDs.
  const sourceIdByWordId = new Map(words.map((word) => [word.id, generateSourceId()]));
  const grid: string[][] = [template.fields.map((field) => field.header)];
  for (const word of words) {
    const values = wordToValues(template, word);
    // STT is blank in the export: the spreadsheet formula fills it, never the backend.
    grid.push(template.fields.map((field) => (field.key === SOURCE_ID_HEADER ? sourceIdByWordId.get(word.id)! : field.displayOnly ? "" : values[field.key] ?? "")));
  }
  const rangeA1 = buildRangeA1(template.sheetTitle, width, grid.length);
  await api.writeValues(spreadsheetId, rangeA1, grid);
  const exported = api.__inspect(spreadsheetId)!.values as string[][];
  assert.equal(exported[0][0], STT_FIELD_KEY === "__stt" ? "STT" : "STT", "STT header must be the first column");
  assert.equal(exported[0][1], SOURCE_ID_HEADER, "__lexora_id must be the second column");
  assert.equal(exported.length, words.length + 1);
  assert.ok(readSourceIdCell(exported[1][1]).length > 0, "the first data row carries a source id at column B");

  // 2. Admin appends a row with no __lexora_id.
  const withNewRow = exported.map((row) => [...row]);
  const newRow: string[] = blankRow(width);
  newRow[2] = "mitigate";
  newRow[3] = "giảm nhẹ";
  withNewRow.push(newRow);

  const parsed = parseSheetGrid(gridFromValuesRange(withNewRow), template);
  const drafts = parseVocabularyRows(
    parsed.map((row) => ({ ...row.values, [SOURCE_ID_HEADER]: row.sourceId })),
    set,
    words.map((word) => importWordKey({ term: word.term }, set.type)),
    { dedupeAgainstExisting: false },
  );

  const wordIdBySourceId = new Map([...sourceIdByWordId].map(([wordId, sourceId]) => [sourceId, wordId]));
  const usedIds = new Set(wordIdBySourceId.keys());
  const created: Array<{ rowNumber: number; sourceId: string; wordId: number }> = [];
  const updated: number[] = [];
  let nextWordId = 900;
  for (const row of parsed) {
    const draft = drafts.rows.find((candidate) => candidate.rowNumber === row.rowNumber);
    if (!draft) continue;
    const sourceId = readSourceIdCell(row.sourceId);
    const fallbackWordId = words.find((word) => importWordKey({ term: word.term }, set.type) === importWordKey({ term: draft.term }, set.type))?.id;
    const wordId = sourceId ? wordIdBySourceId.get(sourceId) : fallbackWordId;
    if (wordId != null) { updated.push(wordId); continue; }
    const minted = sourceId || generateSourceId(usedIds);
    usedIds.add(minted);
    nextWordId += 1;
    wordIdBySourceId.set(minted, nextWordId);
    created.push({ rowNumber: row.rowNumber, sourceId: minted, wordId: nextWordId });
  }
  assert.equal(created.length, 1, "the new 'mitigate' row must be detected as CREATED");
  assert.equal(updated.length, words.length, "existing rows must resolve to their current wordId");

  // 3. The engine writes the minted ID back into the Sheet.
  const newRowIndex = created[0].rowNumber - 2;
  const afterWriteBack = withNewRow.map((row) => [...row]);
  afterWriteBack[newRowIndex][1] = created[0].sourceId;
  const newSourceId = readSourceIdCell(afterWriteBack[newRowIndex][1]);
  assert.ok(newSourceId.startsWith("v_"), "the engine must generate a v_ prefixed source ID");

  // 4. Admin edits Meaning on that same row: identity must stay the same wordId.
  afterWriteBack[newRowIndex][3] = "giảm nhẹ / làm dịu";
  const editedRows = parseSheetGrid(gridFromValuesRange(afterWriteBack), template);
  const editedDrafts = parseVocabularyRows(
    editedRows.map((row) => ({ ...row.values, [SOURCE_ID_HEADER]: row.sourceId })),
    set,
    [],
    { dedupeAgainstExisting: false },
  );
  const editedRow = editedRows.find((row) => readSourceIdCell(row.sourceId) === newSourceId);
  assert.ok(editedRow, "the edited row keeps its __lexora_id");
  const editedDraft = editedDrafts.rows.find((candidate) => candidate.rowNumber === editedRow!.rowNumber);
  assert.equal(editedDraft?.meaning, "giảm nhẹ / làm dịu");
  assert.equal(wordIdBySourceId.get(newSourceId), created[0].wordId, "the edit must update the same wordId");
  assert.notEqual(
    computeWordFingerprint(set.type, editedRow!.values as Record<string, string>),
    computeWordFingerprint(set.type, { meaning: "giảm nhẹ" }),
    "the fingerprint must change so the row is detected as UPDATED",
  );

  // 5. Reordering rows never changes identity.
  const reordered = [afterWriteBack[0], afterWriteBack[newRowIndex], afterWriteBack[1]];
  const reorderedRows = parseSheetGrid(gridFromValuesRange(reordered), template);
  assert.ok(reorderedRows.some((row) => readSourceIdCell(row.sourceId) === newSourceId), "new source id must survive reorder");
});


