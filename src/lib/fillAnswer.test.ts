import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  canPlayTargetAudioBeforeAnswer,
  claimFillAction,
  chunkFillItems,
  createFirstRecallOutcome,
  getAcceptedAnswers,
  getProgressiveHint,
  gradeFillAnswer,
  isValidFillDraft,
  maskAnswerInExample,
  resolveFillFocusEnterAction,
  scheduleDelayedRetry,
  summarizeFillAttempts,
  visibleFillItems,
} from "./fillAnswer";

test("fill grading accepts normalized exact answers", () => {
  assert.equal(gradeFillAnswer("oven", "oven").correct, true);
  assert.equal(gradeFillAnswer(" OVEN ", "oven").correct, true);
});

test("fill grading keeps spelling mistakes wrong and marks a near miss", () => {
  assert.deepEqual(gradeFillAnswer("ovenn", "oven"), {
    correct: false,
    nearMiss: true,
    acceptedAnswers: ["oven"],
  });
});

test("correction and retry never increase the immutable first-attempt score", () => {
  const wrong = createFirstRecallOutcome({ wordId: 1, answer: "ovenn", answerKey: "oven", hintLevelUsed: 0, audioBeforeAnswer: false });
  const corrected = { ...wrong, corrected: true, retryCount: 1, finalCorrect: true };
  const summary = summarizeFillAttempts([corrected], [1]);
  assert.equal(summary.firstTryCorrect, 0);
  assert.equal(summary.finalCorrect, 1);
  assert.deepEqual(summary.weakWordIds, [1]);
});

test("hint and pre-answer audio are tracked as assisted recall", () => {
  const hinted = createFirstRecallOutcome({ wordId: 1, answer: "oven", answerKey: "oven", hintLevelUsed: 2, audioBeforeAnswer: false });
  const listened = createFirstRecallOutcome({ wordId: 2, answer: "fridge", answerKey: "fridge", hintLevelUsed: 0, audioBeforeAnswer: true });
  assert.equal(hinted.firstTryCorrect, false);
  assert.equal(hinted.correctAfterHint, true);
  assert.equal(listened.firstTryCorrect, false);
  assert.equal(listened.correctAfterHint, true);
  assert.equal(getProgressiveHint("oven", 2)?.label, "Chữ đầu");
});

test("target audio is available before recall only in practice", () => {
  assert.equal(canPlayTargetAudioBeforeAnswer("practice"), true);
  assert.equal(canPlayTargetAudioBeforeAnswer("test"), false);
});

test("examples mask every accepted target before recall", () => {
  assert.equal(maskAnswerInExample("We use an oven to bake cakes. Oven gloves help.", "oven"), "We use an ______ to bake cakes. ______ gloves help.");
});

test("accepted answers preserve token and whole-answer slash conventions", () => {
  assert.deepEqual(getAcceptedAnswers("burned/burnt"), ["burned", "burnt"]);
  assert.deepEqual(getAcceptedAnswers("refrigerator / fridge"), ["refrigerator", "fridge"]);
  assert.deepEqual(getAcceptedAnswers("in an/the outfit"), ["in an outfit", "in the outfit"]);
});

test("focus exposes one current item while list exposes the group", () => {
  const words = [1, 2, 3, 4];
  assert.deepEqual(visibleFillItems(words, "focus", 2), [3]);
  assert.deepEqual(visibleFillItems(words, "list", 2), words);
});

test("retry queue inserts a wrong word after several intervening questions", () => {
  const queue = [1, 2, 3, 4, 5, 6, 7];
  const scheduled = scheduleDelayedRetry(queue, 2, 1, 4);
  assert.equal(scheduled.indexOf(2, 2), 6);
  assert.notEqual(scheduled[2], 2);
});

test("double click and Enter share an action gate and cannot count twice", () => {
  const lock = { current: false };
  assert.equal(claimFillAction(lock), true);
  assert.equal(claimFillAction(lock), false);
  lock.current = false;
  assert.equal(claimFillAction(lock), true);
});

test("25 questions retain 10 + 10 + 5 grouping", () => {
  assert.deepEqual(chunkFillItems(Array.from({ length: 25 }, (_, index) => index + 1), 10).map((group) => group.length), [10, 10, 5]);
});

test("draft validation restores compatible sessions and rejects stale or changed sets", () => {
  const draft = {
    version: 2 as const, savedAt: 1_000, wordIds: [1, 2], group: 0,
    queues: { 0: [1, 2] }, cursors: { 0: 1 }, answers: { 1: "oven" }, outcomes: {},
    hintLevels: {}, audioBeforeAnswer: {}, groupResults: {}, phase: "questions" as const,
  };
  assert.equal(isValidFillDraft(draft, [1, 2], 2_000), true);
  assert.equal(isValidFillDraft(draft, [1, 3], 2_000), false);
  assert.equal(isValidFillDraft({ ...draft, version: 1 }, [1, 2], 2_000), false);
});

test("Focus keyboard state machine never submits while typing", () => {
  assert.equal(resolveFillFocusEnterAction({ state: "answering", value: "" }), "noop");
  assert.equal(resolveFillFocusEnterAction({ state: "answering", value: "pale" }), "check");
  assert.equal(resolveFillFocusEnterAction({ state: "answering", value: "pale", repeat: true }), "noop");
  assert.equal(resolveFillFocusEnterAction({ state: "answering", value: "pale", isComposing: true }), "noop");
  assert.equal(resolveFillFocusEnterAction({ state: "correct", value: "pale" }), "next");
  assert.equal(resolveFillFocusEnterAction({ state: "correcting", value: "pal" }), "confirm");
  assert.equal(resolveFillFocusEnterAction({ state: "corrected", value: "pale" }), "next");
  assert.equal(resolveFillFocusEnterAction({ state: "answering", value: "living room" }), "check");
});

test("Focus navigator is an overlay and no longer extends document flow", () => {
  const source = readFileSync("src/components/FillFocusSession.tsx", "utf8");
  assert.match(source, /aria-haspopup="dialog"/);
  assert.match(source, /fixed inset-0 z-\[92\]/);
  assert.doesNotMatch(source, /mx-auto w-full max-w-3xl rounded-xl border border-line bg-white p-3/);
});

test("Focus toolbar owns group, question and progress controls", () => {
  const source = readFileSync("src/components/FillFocusSession.tsx", "utf8");
  assert.match(source, /Câu \$\{Math\.min\(cursor \+ 1, originalWords\.length\)\}/);
  assert.match(source, /fill-focus-session/);
  assert.match(source, /fill-focus-card/);
});
