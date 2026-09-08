import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  canPlayTargetAudioBeforeAnswer,
  claimFillAction,
  chunkFillItems,
  createFirstRecallOutcome,
  getAcceptedAnswers,
  getFillPatternValidationError,
  getProgressiveHint,
  gradeFillAnswer,
  gradeFillAnswerGroups,
  gradeFillResponse,
  isValidFillDraft,
  maskAnswerInExample,
  parseFillAnswerGroups,
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

test("ordinary words and legacy alternatives remain one answer group", () => {
  assert.equal(parseFillAnswerGroups("oven", "noun").kind, "single");
  assert.deepEqual(parseFillAnswerGroups("burned/burnt", "verb").groups[0].acceptedAnswers, ["burned", "burnt"]);
  assert.deepEqual(parseFillAnswerGroups("refrigerator / fridge", "noun").groups[0].acceptedAnswers, ["refrigerator", "fridge"]);
  assert.deepEqual(parseFillAnswerGroups("in an/the outfit", "PATTERN").groups[0].acceptedAnswers, ["in an outfit", "in the outfit"]);
  assert.equal(parseFillAnswerGroups("foo; bar", "noun").kind, "single");
});

test("pattern semicolons create required groups with slash alternatives and shorthand", () => {
  const parsed = parseFillAnswerGroups("sth/sb frustrates sb; sb is frustrated with sth/sb", " Pattern ");
  assert.equal(parsed.kind, "multi_group");
  assert.equal(parsed.groups.length, 2);
  assert.deepEqual(parsed.groups[0].acceptedAnswers, ["sth/sb frustrates sb", "sth frustrates sb", "sb frustrates sb"]);
  assert.deepEqual(parsed.groups[1].acceptedAnswers, ["sb is frustrated with sth/sb", "sb is frustrated with sth", "sb is frustrated with sb"]);
});

test("all required pattern groups must match once, independent of input order", () => {
  const parsed = parseFillAnswerGroups("sth/sb frustrates sb; sb is frustrated with sth/sb", "pattern");
  assert.equal(gradeFillAnswerGroups(["sth frustrates sb", "sb is frustrated with sth"], parsed).correct, true);
  assert.equal(gradeFillAnswerGroups(["sb frustrates sb", "sb is frustrated with sb"], parsed).correct, true);
  assert.equal(gradeFillAnswerGroups(["sth/sb frustrates sb", "sb is frustrated with sth/sb"], parsed).correct, true);
  assert.equal(gradeFillAnswerGroups(["sb is frustrated with sth", "sth frustrates sb"], parsed).correct, true);
  assert.equal(gradeFillAnswerGroups(["sth frustrates sb", ""], parsed).correct, false);
  assert.equal(gradeFillAnswerGroups(["sth frustrates sb", "wrong"], parsed).correct, false);
});

test("one response cannot satisfy two groups and three groups are all required", () => {
  const overlap = parseFillAnswerGroups("foo; foo bar", "pattern");
  assert.equal(gradeFillAnswerGroups(["foo", ""], overlap).correct, false);
  const three = parseFillAnswerGroups("active; passive; causative", "pattern");
  assert.equal(gradeFillAnswerGroups(["causative", "active", "passive"], three).correct, true);
  assert.equal(gradeFillAnswerGroups(["active", "passive", ""], three).correct, false);
});

test("empty and duplicate pattern groups are normalized safely", () => {
  const parsed = parseFillAnswerGroups("foo;; foo ; bar;", "pattern");
  assert.equal(parsed.kind, "multi_group");
  assert.deepEqual(parsed.groups.map((group) => group.source), ["foo", "bar"]);
  assert.match(getFillPatternValidationError("foo;;bar", "pattern") || "", /nhóm rỗng/);
  assert.equal(getFillPatternValidationError("foo;;bar", "noun"), null);
});

test("multi-group outcome is one immutable first-attempt point", () => {
  const wrong = createFirstRecallOutcome({
    wordId: 41,
    answer: ["sth frustrates sb", "wrong"],
    answerKey: "sth/sb frustrates sb; sb is frustrated with sth/sb",
    wtype: "pattern",
    hintLevelUsed: 0,
    audioBeforeAnswer: false,
  });
  assert.equal(wrong.firstTryCorrect, false);
  assert.equal(gradeFillResponse(["sth frustrates sb", "sb is frustrated with sth"], "sth/sb frustrates sb; sb is frustrated with sth/sb", "pattern").correct, true);
  const summary = summarizeFillAttempts([{ ...wrong, corrected: true, finalCorrect: true }], [41]);
  assert.deepEqual({ score: summary.firstTryCorrect, final: summary.finalCorrect, weak: summary.weakWordIds }, { score: 0, final: 1, weak: [41] });
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
  assert.equal(isValidFillDraft({ ...draft, version: 3, answers: { 1: ["active", "passive"] } }, [1, 2], 2_000), true);
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
