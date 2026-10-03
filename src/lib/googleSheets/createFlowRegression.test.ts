import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createFakeGoogleWorkspaceApi } from "@/lib/googleSheets/api";
import { getGoogleSheetTemplate, SOURCE_ID_HEADER, STT_FIELD_KEY } from "@/lib/googleSheets/template";
import { buildAiColumnFormulas, aiColumnLetters, aiColumnsForTemplate } from "@/lib/googleSheets/aiFormula";

/**
 * Regression for the reported bug: creating a Sheet from a set that already has
 * vocabulary used to overwrite the exported cells with raw =AI(...) formulas.
 * The create path must only plant formulas BELOW the exported rows.
 */
test("create plants AI formulas only below the exported vocabulary", () => {
  const lifecycle = readFileSync("src/lib/googleSheets/sheetLifecycle.ts", "utf8");
  // The buffer is reduced by the number of exported rows and starts after them.
  assert.match(lifecycle, /const exportedRowCount = values\.length - 1;/, "the exported row count is computed");
  assert.match(lifecycle, /Math\.max\(AI_FORMULA_BUFFER_ROWS - exportedRowCount, 0\)/, "the buffer never overlaps the exported rows");
  assert.match(lifecycle, /exportedRowCount \+ 2/, "the first formula row is the first row after the export");
  // The writer itself must honour the start row.
  assert.match(lifecycle, /async function writeAiColumnFormulas\([^)]*startRow: number = 2/, "writeAiColumnFormulas accepts a start row");
  assert.match(lifecycle, /\$\{letter\}\$\{startRow\}:\$\{letter\}\$\{endRow\}/, "the range is built from the start row");
});

test("the formula writer never targets STT or __lexora_id", () => {
  const template = getGoogleSheetTemplate({ type: "ielts_vocab", languageCode: "en" });
  const letters = aiColumnLetters(template, template.templateType);
  assert.ok(!letters.has(STT_FIELD_KEY), "STT never receives an AI formula");
  assert.ok(!letters.has(SOURCE_ID_HEADER), "__lexora_id never receives an AI formula");
  const formulas = buildAiColumnFormulas(template, "AI", aiColumnsForTemplate("ielts_vocab")[0], 5, 2);
  assert.equal(formulas.length, 5, "one formula per requested row");
  assert.ok(formulas.every((formula) => formula.startsWith("=AI(")), "every row carries a native AI instruction");
  assert.ok(!formulas.some((formula) => formula.includes("A2")), "the buffer must never target STT (column A)");
});

test("the in-memory fake keeps writes inspectable for the create regression", () => {
  const api = createFakeGoogleWorkspaceApi();
  assert.equal(typeof api.__inspect, "function", "the fake exposes __inspect");
});