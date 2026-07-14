import assert from "node:assert/strict";
import test from "node:test";
import { groupIndexForQuestion, circleStatus } from "./quizGroups";

test("groupIndexForQuestion maps a 1-based question number to a 0-based group index", () => {
  assert.equal(groupIndexForQuestion(1, 10), 0);
  assert.equal(groupIndexForQuestion(10, 10), 0);
  assert.equal(groupIndexForQuestion(11, 10), 1);
  assert.equal(groupIndexForQuestion(25, 10), 2);
});

test("circleStatus reflects graded/answered/correct state", () => {
  assert.equal(circleStatus(false, false, false), "empty");
  assert.equal(circleStatus(false, true, false), "answered");
  assert.equal(circleStatus(true, true, true), "correct");
  assert.equal(circleStatus(true, true, false), "wrong");
  assert.equal(circleStatus(true, false, false), "wrong");
});
