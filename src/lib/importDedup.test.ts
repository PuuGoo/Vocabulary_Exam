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

test("pattern imports remain one vocabulary row", () => {
  const row = {
    term: "sth/sb frustrates sb; sb is frustrated with sth/sb",
    meaning: "điều gì/ai làm ai bực; ai bực với điều gì/ai",
    wtype: "pattern",
  };
  const result = dedupeImportRows([row], "ielts_vocab", []);
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0], row);
});
