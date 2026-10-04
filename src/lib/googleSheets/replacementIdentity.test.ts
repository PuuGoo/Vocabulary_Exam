import assert from "node:assert/strict";
import test from "node:test";
import { replacementIdentities } from "./replacementIdentity";

test("replacement preserves existing IDs, assigns only missing IDs, and does not resurrect archived words", () => {
  const result = replacementIdentities([1, 2, 3], [
    { wordId: 1, sourceId: "v_12345678" },
    { wordId: 3, sourceId: "v_87654321", deletedAt: new Date() },
  ]);
  assert.deepEqual(result[0], { wordId: 1, sourceId: "v_12345678" });
  assert.equal(result[1].wordId, 2);
  assert.notEqual(result[1].sourceId, result[0].sourceId);
  assert.equal(result.length, 2);
});

test("replacement rejects ambiguous identities rather than recreating words", () => {
  assert.throws(() => replacementIdentities([1], [{ wordId: 1, sourceId: "bad" }]));
  assert.throws(() => replacementIdentities([1], [{ wordId: 1, sourceId: "v_12345678" }, { wordId: 1, sourceId: "v_87654321" }]));
});
