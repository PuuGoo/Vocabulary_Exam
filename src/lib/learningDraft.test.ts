import assert from "node:assert/strict";
import test from "node:test";
import { isLearningDraftFresh, LEARNING_DRAFT_MAX_AGE, restoreItemsByIds } from "./learningDraft";

test("learning draft restores the exact saved item order", () => {
  const items = [{ id: 1, label: "A" }, { id: 2, label: "B" }, { id: 3, label: "C" }];
  assert.deepEqual(restoreItemsByIds(items, [3, 1, 2])?.map((item) => item.id), [3, 1, 2]);
});

test("learning draft is rejected when content changed or ids repeat", () => {
  const items = [{ id: 1 }, { id: 2 }];
  assert.equal(restoreItemsByIds(items, [1, 3]), null);
  assert.equal(restoreItemsByIds(items, [1, 1]), null);
  assert.equal(restoreItemsByIds(items, []), null);
});

test("learning drafts expire after 24 hours", () => {
  const now = 2_000_000_000_000;
  assert.equal(isLearningDraftFresh(now - LEARNING_DRAFT_MAX_AGE + 1, now), true);
  assert.equal(isLearningDraftFresh(now - LEARNING_DRAFT_MAX_AGE, now), false);
  assert.equal(isLearningDraftFresh(now + 1, now), false);
});
