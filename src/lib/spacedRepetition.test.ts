import assert from "node:assert/strict";
import test from "node:test";
import { nextSpacedProgress } from "./spacedRepetition";

const now = new Date("2026-07-20T00:00:00.000Z");

test("a correct streak follows the 1, 3, 7, 14 day schedule", () => {
  let state = nextSpacedProgress(null, true, now);
  assert.equal(state.intervalDays, 1);
  assert.equal(state.known, true);
  state = nextSpacedProgress(state, true, now);
  assert.equal(state.intervalDays, 3);
  assert.equal(state.known, true);
  state = nextSpacedProgress(state, true, now);
  assert.equal(state.intervalDays, 7);
  state = nextSpacedProgress(state, true, now);
  assert.equal(state.intervalDays, 14);
});

test("a wrong answer resets the streak and returns tomorrow", () => {
  const state = nextSpacedProgress({ reviewStreak: 4, correctCount: 8, wrongCount: 1 }, false, now);
  assert.equal(state.reviewStreak, 0);
  assert.equal(state.intervalDays, 1);
  assert.equal(state.known, false);
  assert.equal(state.correctCount, 8);
  assert.equal(state.wrongCount, 2);
  assert.equal(state.nextReviewAt.toISOString(), "2026-07-21T00:00:00.000Z");
});

test("long streaks stay on the 60 day maintenance interval", () => {
  const state = nextSpacedProgress({ reviewStreak: 20 }, true, now);
  assert.equal(state.intervalDays, 60);
});
