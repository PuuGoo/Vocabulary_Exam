import assert from "node:assert/strict";
import test from "node:test";
import { getSwipeDirection } from "./swipe";

test("swipe recognises deliberate horizontal gestures", () => {
  assert.equal(getSwipeDirection(-70, 8, 400), "left");
  assert.equal(getSwipeDirection(70, -5, 400), "right");
  assert.equal(getSwipeDirection(-32, 4, 180), "left");
});

test("swipe ignores taps, slow short drags and vertical scrolling", () => {
  assert.equal(getSwipeDirection(12, 2, 80), null);
  assert.equal(getSwipeDirection(35, 4, 500), null);
  assert.equal(getSwipeDirection(60, 80, 180), null);
});
