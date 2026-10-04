import assert from "node:assert/strict";
import test from "node:test";
import { firstTemplateBufferRow } from "./newWordRow";

test("native AI buffer does not push web-created words to row 1001", () => {
  const headers = ["STT", "__lexora_id", "Word", "Meaning"];
  const rows = [headers, ["1", "v_12345678", "hello", "greeting"], ...Array.from({ length: 998 }, () => ['=IF(B3="";"";1)', "", "", '=AI("meaning";C3)'])];
  assert.equal(firstTemplateBufferRow(rows, headers), 3);
});

test("user text and non-AI formulas are not considered empty template rows", () => {
  const headers = ["STT", "Word", "Notes"];
  assert.equal(firstTemplateBufferRow([headers, ["", "", "keep me"], ["", "", "=SUM(1,2)"]], headers), null);
});
