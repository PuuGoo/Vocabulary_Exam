import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";
import { buildDailyReviewPlan, evaluateSetReviewResult, selectSetReviewWords, startSetReview, type DueSetReview, type ReviewWord } from "./reviewPlanner";

const now = new Date("2026-09-02T08:00:00.000Z");
const word = (id: number, setId = 1, overrides: Partial<ReviewWord> = {}): ReviewWord => ({
  id, setId, setName: `Set ${setId}`, known: true, nextReviewAt: new Date("2026-09-02T07:00:00.000Z"),
  reviewStreak: 2, correctCount: 2, wrongCount: 0, timesWrong: 0, ...overrides,
});
const review = (setId: number, stage: 1 | 2 | 3, words: ReviewWord[]): DueSetReview => ({
  setId, setName: `Set ${setId}`, stage, nextReviewAt: new Date("2026-09-02T07:00:00.000Z"), words,
});

test("60 existing sets create zero set reviews until initial Learn completion", () => {
  assert.equal(buildDailyReviewPlan({ dueWords: [], dueSetReviews: [], now }).dueSetReviews, 0);
});

test("initial completion schedules R1 one day from actual completion", () => {
  assert.equal(startSetReview(now).nextReviewAt.toISOString(), "2026-09-03T08:00:00.000Z");
});

test("set checkpoint pass, weak pass, fail, late completion and consolidation", () => {
  assert.equal(evaluateSetReviewResult(1, .8, now).nextReviewAt?.toISOString(), "2026-09-05T08:00:00.000Z");
  assert.equal(evaluateSetReviewResult(2, .8, now).nextReviewAt?.toISOString(), "2026-09-09T08:00:00.000Z");
  assert.equal(evaluateSetReviewResult(2, .7, now).nextReviewAt?.toISOString(), "2026-09-06T08:00:00.000Z");
  const failed = evaluateSetReviewResult(2, .59, now);
  assert.equal(failed.stage, 2); assert.equal(failed.nextReviewAt?.toISOString(), "2026-09-03T08:00:00.000Z");
  const done = evaluateSetReviewResult(3, .91, now);
  assert.equal(done.stage, 4); assert.equal(done.nextReviewAt, null); assert.equal(done.consolidated, true);
  const late = new Date("2026-09-05T08:00:00.000Z");
  assert.equal(evaluateSetReviewResult(1, .9, late).nextReviewAt?.toISOString(), "2026-09-08T08:00:00.000Z");
});

test("set review samples scale down by round and keep all small R1 sets", () => {
  const words = Array.from({ length: 50 }, (_, index) => word(index + 1));
  assert.equal(selectSetReviewWords(review(1, 1, words), now).length, 25);
  assert.ok(selectSetReviewWords(review(1, 2, words), now).length >= 10);
  assert.ok(selectSetReviewWords(review(1, 3, words), now).length <= 15);
  assert.equal(selectSetReviewWords(review(1, 1, words.slice(0, 20)), now).length, 20);
});

test("daily budget caps the recommendation and preserves backlog", () => {
  const dueWords = Array.from({ length: 70 }, (_, index) => word(index + 1, Math.floor(index / 10) + 1));
  const plan = buildDailyReviewPlan({ dueWords, dueSetReviews: [], wordBudget: 40, now });
  assert.equal(plan.plannedWords, 40); assert.equal(plan.backlog.words, 30); assert.equal(plan.totalDueWords, 70);
});

test("overdue and mistake-heavy words rank before normal due words", () => {
  const normal = word(1);
  const overdue = word(2, 1, { nextReviewAt: new Date("2026-08-20T08:00:00.000Z") });
  const difficult = word(3, 1, { timesWrong: 8, known: false });
  const plan = buildDailyReviewPlan({ dueWords: [normal, overdue, difficult], dueSetReviews: [], wordBudget: 2, now });
  const ids = plan.batches.flatMap((batch) => batch.words.map((item) => item.id));
  assert.equal(ids.includes(2), true); assert.equal(ids.includes(3), true); assert.equal(ids.includes(1), false);
});

test("word due and set checkpoint candidates are deduplicated", () => {
  const words = Array.from({ length: 12 }, (_, index) => word(index + 1));
  const plan = buildDailyReviewPlan({ dueWords: words.slice(0, 8), dueSetReviews: [review(1, 2, words)], wordBudget: 40, now });
  const ids = plan.batches.flatMap((batch) => batch.words.map((item) => item.id));
  assert.equal(ids.length, new Set(ids).size); assert.equal(plan.batches[0].reviewRound, 2);
});

test("planner handles 200 sets and 5000 words without quadratic overload", () => {
  const dueWords = Array.from({ length: 5000 }, (_, index) => word(index + 1, index % 200 + 1, { timesWrong: index % 7 }));
  const bySet = new Map<number, ReviewWord[]>();
  for (const item of dueWords) bySet.set(item.setId, [...(bySet.get(item.setId) || []), item]);
  const reviews = Array.from({ length: 200 }, (_, index) => review(index + 1, ((index % 3) + 1) as 1 | 2 | 3, bySet.get(index + 1) || []));
  const started = performance.now();
  const plan = buildDailyReviewPlan({ dueWords, dueSetReviews: reviews, wordBudget: 40, now });
  assert.equal(plan.plannedWords, 40);
  assert.ok(performance.now() - started < 1500);
});
