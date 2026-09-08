import assert from "node:assert/strict";
import test from "node:test";
import { isLearningDraftFresh, LEARNING_DRAFT_MAX_AGE, restoreItemsByIds } from "./learningDraft";
import {
  fillScopeDraftSegment,
  filterWordsByFillScope,
  quizProgressMode,
  resolveFillWordScope,
} from "./unknownFill";

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

test("unknown fill includes only explicitly unknown words", () => {
  const words = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const progress = { 1: false, 2: true, 3: false };
  assert.deepEqual(filterWordsByFillScope(words, progress, "unknown").map((word) => word.id), [1, 3]);
  assert.deepEqual(filterWordsByFillScope(words, progress, "all").map((word) => word.id), [1, 2, 3, 4]);
});

test("retest and quick practice take precedence over unknown scope", () => {
  assert.equal(resolveFillWordScope({ mode: "fill", scope: "unknown", retest: false, quickMode: false }), "unknown");
  assert.equal(resolveFillWordScope({ mode: "fill", scope: "unknown", retest: true, quickMode: false }), "all");
  assert.equal(resolveFillWordScope({ mode: "fill", scope: "unknown", retest: false, quickMode: true }), "all");
  assert.equal(resolveFillWordScope({ mode: "mc", scope: "unknown", retest: false, quickMode: false }), "all");
});

test("unknown fill uses separate local and server progress identities", () => {
  assert.notEqual(fillScopeDraftSegment("unknown"), fillScopeDraftSegment("all"));
  assert.equal(quizProgressMode("fill", "unknown"), "fill_unknown");
  assert.equal(quizProgressMode("fill", "all"), "fill");
});
