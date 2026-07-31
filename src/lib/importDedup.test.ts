import assert from "node:assert/strict";
import test from "node:test";
import { dedupeImportRows, importWordKey } from "./importDedup";

test("vocabulary imports deduplicate existing and repeated terms case-insensitively", () => {
  const result = dedupeImportRows(
    [{ term: " Meal " }, { term: "meal" }, { term: "Trip" }],
    "ielts_vocab",
    [importWordKey({ term: "MEAL" }, "ielts_vocab")],
  );
  assert.deepEqual(result.rows, [{ term: "Trip" }]);
  assert.equal(result.duplicateCount, 2);
});

test("irregular verb imports use all three forms as the identity", () => {
  const result = dedupeImportRows(
    [{ v1: "go", v2: "went", v3: "gone" }, { v1: "go", v2: "went", v3: "gone" }, { v1: "take", v2: "took", v3: "taken" }],
    "irregular_verb",
    [],
  );
  assert.equal(result.rows.length, 2);
  assert.equal(result.duplicateCount, 1);
});
