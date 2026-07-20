import test from "node:test";
import assert from "node:assert/strict";
import { buildCsv, csvCell } from "./csv";

test("csvCell escapes quotes and prevents spreadsheet formulas", () => {
  assert.equal(csvCell('An "IELTS"'), '"An ""IELTS"""');
  assert.equal(csvCell("=HYPERLINK(\"bad\")"), '"\'=HYPERLINK(""bad"")"');
});

test("buildCsv includes UTF-8 BOM and Windows-compatible line endings", () => {
  assert.equal(buildCsv(["Tên", "Điểm"], [["Lan", 90]]), '\uFEFF"Tên","Điểm"\r\n"Lan","90"');
});
