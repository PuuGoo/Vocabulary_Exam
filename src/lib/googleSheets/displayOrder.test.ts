import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { visibleWordPositions } from "./displayOrder";

test("archived position gaps do not appear in visible STT", () => {
  const rows = [{ id: 10, position: 9, term: "money" }, { id: 12, position: 11, term: "delete" }];
  const preceding = Array.from({ length: 8 }, (_, index) => ({ id: index + 1, position: index + 1, term: "word" }));
  const result = visibleWordPositions([...preceding, ...rows]);
  assert.equal(result[9].position, 10);
  assert.equal(result[9].id, 12);
  assert.equal(rows[1].position, 11);
  assert.deepEqual(visibleWordPositions([]), []);
});

test("set detail numbers only after archived vocabulary is filtered", () => {
  const route = readFileSync("src/app/api/sets/[id]/route.ts", "utf8");
  assert.ok(route.indexOf("wordList = visibleWordPositions(wordList)") > route.indexOf("allWords.filter((word) => !archived.has(word.id))"));
});
