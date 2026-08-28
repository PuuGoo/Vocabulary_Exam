import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseQuestionSpreadsheetRows, safeSpreadsheetCell } from "./questionImportSpreadsheet";

test("parses a standard Excel question row", () => {
  const [item] = parseQuestionSpreadsheetRows([{ question_number: 1, question: "Tính toàn vẹn?", option_a: "Một", option_b: "Hai", option_c: "Ba", option_d: "Bốn", correct_answer: "A", explanation: "Giải thích", difficulty: "medium", tags: "an toàn, CIA" }]);
  assert.equal(item.options.length, 4); assert.equal(item.options[0].isCorrect, true); assert.deepEqual(item.tags, ["an toàn", "CIA"]); assert.equal(item.status, "ready");
});
test("accepts Excel rows with only required columns", () => {
  const [item] = parseQuestionSpreadsheetRows([{ question: "Đúng hay sai?", option_a: "Đúng", option_b: "Sai", correct_answer: "A" }]);
  assert.equal(item.options.length, 2); assert.equal(item.status, "ready");
});
test("missing Excel question is an error", () => {
  const [item] = parseQuestionSpreadsheetRows([{ question: "", option_a: "aaa", option_b: "bbb" }]);
  assert.ok(item.issues.includes("MISSING_QUESTION")); assert.equal(item.status, "error");
});
test("invalid Excel answer is reviewable", () => {
  const [item] = parseQuestionSpreadsheetRows([{ question: "Chọn?", option_a: "aaa", option_b: "bbb", correct_answer: "E" }]);
  assert.ok(item.issues.includes("INVALID_CORRECT_ANSWER")); assert.equal(item.status, "needs_review");
});
test("unknown Excel columns do not crash parsing", () => {
  const [item] = parseQuestionSpreadsheetRows([{ abc: "x", xyz: "y", note123: "z" }]);
  assert.ok(item.issues.includes("MISSING_QUESTION"));
});
test("duplicate stable IDs are reported on every conflicting row", () => {
  const items = parseQuestionSpreadsheetRows([{ id: 42, question: "Một?", option_a: "a", option_b: "b", correct_answer: "A" }, { id: 42, question: "Hai?", option_a: "a", option_b: "b", correct_answer: "B" }]);
  assert.ok(items.every((item) => item.issues.includes("DUPLICATE_STABLE_ID") && item.status === "needs_review"));
});
test("duplicate Excel question text is not silently replaced", () => {
  const [item] = parseQuestionSpreadsheetRows([{ question: "  TÍNH TOÀN VẸN? ", option_a: "Đúng", option_b: "Sai" }], [{ id: 9, question: "Tính toàn vẹn." }]);
  assert.equal(item.duplicateOf?.id, 9); assert.ok(item.issues.includes("POSSIBLE_DUPLICATE"));
});
test("escapes spreadsheet formula injection prefixes", () => {
  for (const value of ["=CMD(...) ", "+SUM(A1:A2)", "-1+1", "@something", "  =HYPERLINK(\"x\")"]) assert.ok(safeSpreadsheetCell(value).startsWith("'"));
  assert.equal(safeSpreadsheetCell("Tính toàn vẹn"), "Tính toàn vẹn");
});
test("XLSX write/read roundtrip preserves Vietnamese Unicode as text", () => {
  const source = [{ question: safeSpreadsheetCell("Tính toàn vẹn và mã hóa dữ liệu"), option_a: safeSpreadsheetCell("ủy quyền"), option_b: safeSpreadsheetCell("Xác thực") }];
  const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(source), "Questions");
  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const restored = XLSX.utils.sheet_to_json<Record<string, string>>(XLSX.read(bytes, { type: "buffer" }).Sheets.Questions);
  assert.deepEqual(restored, source);
});
