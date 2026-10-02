import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildSttFormula,
  getGoogleSheetTemplate,
  SOURCE_ID_HEADER,
  STT_FIELD_KEY,
  STT_HEADER,
} from "@/lib/googleSheets/template";
import { columnLetter, valuesForExport } from "@/lib/googleSheets/spreadsheet";
import { mapHeadersToFieldKeys, parseSheetGrid } from "@/lib/googleSheets/parser";
import { computeWordFingerprint } from "@/lib/googleSheets/fingerprint";
import { parseVocabularyRows } from "@/lib/vocabImport/parse";
import { createFakeGoogleWorkspaceApi } from "@/lib/googleSheets/api";
import { configureSheetLayout } from "@/lib/googleSheets/formatting";

/**
 * STT is a presentation-only column in the Google Sheet.
 *
 * Rules under test:
 *  - it is always column A and __lexora_id always follows it,
 *  - the backend never writes STT values (the spreadsheet formula does),
 *  - the parser drops STT before it can reach the vocabulary model,
 *  - STT is not part of the fingerprint, the identity or the import model,
 *  - the formula renumbers contiguously as rows are added/removed/sorted.
 */

const SETS = [
  { type: "ielts_vocab", languageCode: "en", name: "IELTS" },
  { type: "irregular_verb", languageCode: "en", name: "Irregular" },
  { type: "language_vocab", languageCode: "zh-CN", name: "Mandarin" },
] as const;

test("A. create sheet: STT exists as the first column of every template", () => {
  for (const set of SETS) {
    const template = getGoogleSheetTemplate(set);
    assert.equal(template.fields[0].key, STT_FIELD_KEY, set.name);
    assert.equal(template.fields[0].header, STT_HEADER, set.name);
    assert.equal(template.fields[0].displayOnly, true, set.name);
    assert.equal(template.fields[1].key, SOURCE_ID_HEADER, `${set.name}: __lexora_id must follow STT`);
    assert.ok(template.fields.length > 2, set.name);
    assert.equal(template.templateVersion, 2, "the layout change bumps the template version");
  }
});

test("B. initial vocabulary: export blanks STT and the formula numbers rows", () => {
  const template = getGoogleSheetTemplate({ type: "ielts_vocab", languageCode: "en" });
  const rows = [
    { sourceId: "v_abc123", values: { term: "abandon", meaning: "từ bỏ" } },
    { sourceId: "v_def456", values: { term: "acquire", meaning: "đạt được" } },
    { sourceId: "v_ghi789", values: { term: "facilitate", meaning: "tạo điều kiện" } },
  ];
  const values = valuesForExport(template, rows);
  assert.equal(values[0][0], STT_HEADER, "header row starts with STT");
  assert.equal(values[0][1], SOURCE_ID_HEADER, "__lexora_id is column B");
  for (const dataRow of values.slice(1)) {
    assert.equal(dataRow[0], "", "the backend must never send an STT value");
    assert.ok(String(dataRow[1]).startsWith("v_"), "column B carries the source id");
  }
  // The formula counts filled __lexora_id cells above, so row 2 -> 1, row 3 -> 2...
  const lastRow = rows.length + 1;
  for (let row = 2; row <= lastRow; row += 1) {
    assert.equal(buildSttFormula(template, row), `=IF(B${row}="";"";COUNTIF($B$2:B${row};"<>"))`);
  }
  // __lexora_id lives at index 1 for every template.
  for (const set of SETS) {
    const tpl = getGoogleSheetTemplate(set);
    assert.equal(columnLetter(tpl.fields.findIndex((f) => f.key === SOURCE_ID_HEADER)), "B", set.name);
  }
});

test("C/D/E/F. STT renumbers contiguously for add, delete, reorder and sort", () => {
  // Mirror the formula: numbering is derived from the visible row order only.
  const numbers = (rows: Array<{ id: string; term: string }>) => rows.map((_, index) => index + 1);
  const initial = [
    { id: "v_1", term: "abandon" },
    { id: "v_2", term: "acquire" },
    { id: "v_3", term: "facilitate" },
  ];
  assert.deepEqual(numbers(initial), [1, 2, 3]);
  // D. delete the middle row -> renumber, no gap.
  assert.deepEqual(numbers(initial.filter((row) => row.id !== "v_2")), [1, 2]);
  // C. insert in the middle -> renumber.
  assert.deepEqual(numbers([initial[0], { id: "v_4", term: "mitigate" }, initial[2]]), [1, 2, 3]);
  // E. reorder -> STT follows the new visual order.
  assert.deepEqual(numbers([initial[2], initial[0], initial[1]]), [1, 2, 3]);
  // F. sort alphabetically -> STT follows the sorted order.
  assert.deepEqual(numbers([...initial].sort((a, b) => a.term.localeCompare(b.term))), [1, 2, 3]);
});

test("G. sync ignores STT: it never reaches the vocabulary import model", () => {
  const template = getGoogleSheetTemplate({ type: "ielts_vocab", languageCode: "en" });
  const headers = template.fields.map((field) => field.header);
  const mapping = mapHeadersToFieldKeys(headers, template);
  for (const key of mapping.values()) assert.notEqual(key, STT_FIELD_KEY, "STT must not be mapped");

  const parsed = parseSheetGrid({ headers, rows: [["99", "v_abc123", "abandon", "từ bỏ"]] }, template);
  assert.equal(parsed.length, 1);
  assert.ok(!("stt" in parsed[0].values), "no stt key in the parsed values");
  assert.ok(!("__stt" in parsed[0].values), "no display field in the parsed values");
  assert.equal(parsed[0].sourceId, "v_abc123");

  const drafts = parseVocabularyRows(
    parsed.map((row) => ({ ...row.values, [SOURCE_ID_HEADER]: row.sourceId })),
    { id: 1, type: "ielts_vocab", languageCode: "en" },
    [],
    { dedupeAgainstExisting: false },
  );
  assert.equal(drafts.rows.length, 1);
  assert.ok(!("stt" in drafts.rows[0]), "ParsedWordDraft must not carry stt");
  assert.ok(!("__stt" in drafts.rows[0]), "ParsedWordDraft must not carry __stt");
  assert.equal(drafts.rows[0].term, "abandon");
});

test("H. changing only STT never changes the fingerprint", () => {
  const template = getGoogleSheetTemplate({ type: "ielts_vocab", languageCode: "en" });
  const headers = template.fields.map((field) => field.header);
  const a = parseSheetGrid({ headers, rows: [["1", "v_abc123", "abandon", "từ bỏ"]] }, template)[0];
  const b = parseSheetGrid({ headers, rows: [["20", "v_abc123", "abandon", "từ bỏ"]] }, template)[0];
  const fa = computeWordFingerprint("ielts_vocab", a.values as Record<string, string>);
  const fb = computeWordFingerprint("ielts_vocab", b.values as Record<string, string>);
  assert.equal(fa, fb, "STT must not be part of the business fingerprint");
  const keys = template.fields.filter((field) => !field.displayOnly && field.key !== SOURCE_ID_HEADER).map((field) => field.key);
  assert.ok(!keys.includes(STT_FIELD_KEY));
});

test("I. identity ignores STT: moving a row keeps the same source id", () => {
  const template = getGoogleSheetTemplate({ type: "ielts_vocab", languageCode: "en" });
  const headers = template.fields.map((field) => field.header);
  const top = parseSheetGrid({ headers, rows: [["1", "v_abc123", "abandon", "từ bỏ"]] }, template)[0];
  const moved = parseSheetGrid({ headers, rows: [["50", "v_abc123", "abandon", "từ bỏ"]] }, template)[0];
  assert.equal(top.sourceId, moved.sourceId);
  assert.equal(top.sourceId, "v_abc123");
  // STT and the row number are bookkeeping: only __lexora_id resolves a word.
  assert.equal(top.rowNumber, moved.rowNumber, "the row number must not vary with STT");
  assert.equal(parseSheetGrid({ headers, rows: [["", "v_abc123", "abandon", "từ bỏ"]] }, template)[0].sourceId, "v_abc123", "a blank STT cell still resolves the same word");
});

test("the STT column is centered, narrow and covered by the header filter", async () => {
  const template = getGoogleSheetTemplate({ type: "ielts_vocab", languageCode: "en" });
  const calls: Array<{ spreadsheetId: string; requests: Record<string, unknown>[] }> = [];
  const api = createFakeGoogleWorkspaceApi({
    batchUpdate: async (spreadsheetId, requests) => { calls.push({ spreadsheetId, requests }); },
  });
  await configureSheetLayout(api as never, { spreadsheetId: "sheet-1", sheetId: 7, template, rowCount: 3 });
  assert.equal(calls.length, 1);
  const requests = calls[0].requests;
  const sttColumn = template.fields.findIndex((field) => field.key === STT_FIELD_KEY);
  assert.equal(sttColumn, 0);
  assert.equal(columnLetter(sttColumn), "A");
  const sttWidth = requests.find((request) => (request as { updateDimensionProperties?: { range?: { startIndex?: number } } }).updateDimensionProperties?.range?.startIndex === sttColumn);
  assert.ok(sttWidth, "STT column width request must exist");
  assert.ok(JSON.stringify(requests).includes("horizontalAlignment"), "STT must be centered");
  assert.ok(JSON.stringify(requests).includes("setBasicFilter"), "the header row must stay filterable");
});

/**
 * Regression: the Sheets API rejects wrapStrategy values other than WRAP/CLIP.
 *
 * Production bug: the STT column was formatted with OVERFLOW, Google answered
 * HTTP 400 invalid_value at `requests[4].repeat_cell...wrap_strategy`,
 * configureSheetLayout threw, and createGoogleSheetForSet aborted AFTER the
 * vocabulary had been written. The sheet ended up with headers only and the
 * connection was stuck in status=error (what the admin saw as "Chưa kết
 * nối" while POST /create answered 409).
 *
 * Verified against the real API: CLIP and WRAP are accepted; OVERFLOW, NONE
 * and "" are all rejected.
 */
test("STT formatting only uses wrapStrategy values Google accepts", async () => {
  const template = getGoogleSheetTemplate({ type: "ielts_vocab", languageCode: "en" });
  const requests: Record<string, unknown>[] = [];
  const api = createFakeGoogleWorkspaceApi({
    batchUpdate: async (_spreadsheetId, batch) => { requests.push(...batch); },
  });
  await configureSheetLayout(api as never, { spreadsheetId: "sheet-1", sheetId: 7, template, rowCount: 3 });

  const ALLOWED = new Set(["WRAP", "CLIP"]);
  const raw = JSON.stringify(requests);
  assert.ok(!raw.includes("OVERFLOW"), "OVERFLOW is rejected by the Sheets API and aborted the create flow");
  assert.ok(!raw.includes("NONE"), "NONE is also rejected by the Sheets API");

  for (const request of requests) {
    const repeat = (request as { repeatCell?: { cell?: { userEnteredFormat?: { wrapStrategy?: string } } } }).repeatCell;
    const strategy = repeat?.cell?.userEnteredFormat?.wrapStrategy;
    if (strategy !== undefined) assert.ok(ALLOWED.has(strategy), `unexpected wrapStrategy: ${strategy}`);
  }

  // The STT column must still be centered and narrow.
  assert.ok(raw.includes("horizontalAlignment"), "STT stays centered");
  assert.ok(raw.includes('"pattern":"0"'), "STT stays a plain integer display");

  // And the layout must still freeze + filter the header.
  assert.ok(raw.includes("frozenRowCount"));
  assert.ok(raw.includes("setBasicFilter"));
});

/**
 * Regression: a cosmetic failure must never orphan a sheet that already holds
 * the exported vocabulary. Formatting and the STT formula are best-effort.
 */
test("create survives a formatting failure after the vocabulary is written", () => {
  const lifecycle = readFileSync("src/lib/googleSheets/sheetLifecycle.ts", "utf8");
  const layoutIdx = lifecycle.indexOf("configureSheetLayout(");
  const writeIdx = lifecycle.indexOf("api.writeValues(created.spreadsheetId");
  const insertIdx = lifecycle.indexOf("db.insert(googleSheetConnections)");
  assert.ok(writeIdx > 0 && layoutIdx > writeIdx, "data must be written before layout");
  const afterLayout = lifecycle.slice(layoutIdx, insertIdx);
  assert.match(afterLayout, /catch \(error\)/, "configureSheetLayout must be wrapped in try/catch");
  assert.ok(!/await api\.batchUpdate\(created/.test(afterLayout) || /try/.test(afterLayout), "batchUpdate must be best-effort");
  const sttIdx = lifecycle.indexOf("writeSttFormula(");
  const sttRegion = lifecycle.slice(sttIdx - 400, sttIdx + 400);
  assert.match(sttRegion, /catch \(error\)/, "writeSttFormula must be best-effort too");
});

test("legacy sheets without an STT column still parse (STT is optional)", () => {
  const template = getGoogleSheetTemplate({ type: "irregular_verb", languageCode: "en" });
  const headers = [SOURCE_ID_HEADER, "Meaning", "V1", "V2", "V3", "IPA V1", "IPA V2", "IPA V3"];
  const rows = [["v_abc123", "go", "go", "went", "gone", "ɡəʊ", "wɛnt", "ɡɒn"]];
  const parsed = parseSheetGrid({ headers, rows }, template);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].sourceId, "v_abc123");
  assert.equal(parsed[0].values.meaning, "go");
});

test("a header of STT anywhere in the row is still ignored", () => {
  const template = getGoogleSheetTemplate({ type: "ielts_vocab", languageCode: "en" });
  const headers = ["Word", STT_HEADER, SOURCE_ID_HEADER, "Meaning"];
  const mapping = mapHeadersToFieldKeys(headers, template);
  for (const key of mapping.values()) assert.notEqual(key, STT_FIELD_KEY);
  const parsed = parseSheetGrid({ headers, rows: [["abandon", "1", "v_abc123", "từ bỏ"]] }, template);
  assert.equal(parsed[0].sourceId, "v_abc123");
  assert.equal(parsed[0].values.term, "abandon");
  assert.equal(parsed[0].values.meaning, "từ bỏ");
});
