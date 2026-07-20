import test from "node:test";
import assert from "node:assert/strict";
import { formatTimer, nextPomodoroPhase, remainingSeconds } from "./pomodoro";

test("Pomodoro uses a long break after every fourth focus cycle", () => {
  assert.deepEqual(nextPomodoroPhase("focus", 2), { phase: "short_break", completedFocus: 3 });
  assert.deepEqual(nextPomodoroPhase("focus", 3), { phase: "long_break", completedFocus: 4 });
  assert.deepEqual(nextPomodoroPhase("long_break", 4), { phase: "focus", completedFocus: 4 });
});

test("Pomodoro time helpers handle elapsed clocks", () => {
  assert.equal(remainingSeconds(61_001, 1_000), 61);
  assert.equal(remainingSeconds(999, 1_000), 0);
  assert.equal(formatTimer(1500), "25:00");
});
