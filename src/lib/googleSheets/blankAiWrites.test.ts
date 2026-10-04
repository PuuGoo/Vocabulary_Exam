import assert from "node:assert/strict";
import test from "node:test";
import { blankAiWrites } from "./blankAiWrites";

test("automatic AI fill preserves user text, materialized results and existing formulas", () => {
  const values = [["header"], ["user text", '=AI("old",C2)', '=IF(TRUE,"","")', "", 0, false, " "]];
  const cells = ["A", "B", "C", "D", "E", "F", "G"].map(letter => ({ letter, formula: '=AI("new",C2)' }));
  const result = blankAiWrites("Words", values, [{ rowNumber: 2, cells }]);
  assert.deepEqual(result.map(update => update.rangeA1), ["'Words'!D2"]);
});

test("automatic fill supports empty trailing cells and multi-letter columns", () => {
  const result = blankAiWrites("A's", [], [{ rowNumber: 10, cells: [{ letter: "AA", formula: '=AI("new",C10)' }] }]);
  assert.equal(result[0].rangeA1, "'A''s'!AA10");
  assert.equal(result[0].parseFormulas, true);
});
