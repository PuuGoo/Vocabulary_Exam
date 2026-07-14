import assert from "node:assert/strict";
import test from "node:test";
import { groupMistakesBySet, type MistakeRow } from "./reviewGroups";

function row(overrides: Partial<MistakeRow>): MistakeRow {
  return {
    id: 1,
    timesWrong: 1,
    lastWrongAt: "2026-01-01T00:00:00.000Z",
    wordId: 1,
    meaning: "nghĩa",
    term: "term",
    v1: null,
    v2: null,
    v3: null,
    ipa: null,
    setId: 1,
    setName: "Bộ A",
    setType: "ielts_vocab",
    ...overrides,
  };
}

test("groupMistakesBySet groups rows by setId, preserving first-seen order", () => {
  const rows = [
    row({ id: 1, setId: 2, setName: "Bộ B", wordId: 10 }),
    row({ id: 2, setId: 1, setName: "Bộ A", wordId: 11 }),
    row({ id: 3, setId: 2, setName: "Bộ B", wordId: 12 }),
  ];
  const groups = groupMistakesBySet(rows);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].setId, 2);
  assert.equal(groups[0].items.length, 2);
  assert.equal(groups[1].setId, 1);
  assert.equal(groups[1].items.length, 1);
});

test("groupMistakesBySet returns an empty array for no rows", () => {
  assert.deepEqual(groupMistakesBySet([]), []);
});
