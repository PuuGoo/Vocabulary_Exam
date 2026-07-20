import test from "node:test";
import assert from "node:assert/strict";
import { feynmanIntervalDays, nextFeynmanReview } from "./feynman";

test("Feynman reviews return uncertain words quickly", () => {
  assert.equal(feynmanIntervalDays(1, 9), 1);
  assert.equal(feynmanIntervalDays(2, 0), 3);
  assert.equal(feynmanIntervalDays(3, 2), 30);
});

test("nextFeynmanReview schedules from the supplied time", () => {
  const now = new Date("2026-07-20T00:00:00Z");
  assert.equal(nextFeynmanReview(3, 0, now).toISOString(), "2026-07-27T00:00:00.000Z");
});
