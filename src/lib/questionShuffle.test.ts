import test from "node:test";
import assert from "node:assert/strict";
import { applyPermanentOptionOrder, createQuestionAttempt, fisherYates, gradeStableOptions, isQuestionAttemptValid, planPermanentOptionShuffle, resolveQuestionAttempt, type QuestionShuffleSettings } from "./questionShuffle";

const balanced: QuestionShuffleSettings = { shuffleQuestions: false, shuffleOptions: true, shuffleMode: "balanced" };
function seeded(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; }; }
function question(id: number, optionCount = 4, correctOptions = ["A"]) { return { id, options: Array.from({ length: optionCount }, (_, index) => `${id}-${String.fromCharCode(65 + index)}`), correctOptions }; }

test("Fisher-Yates returns a permutation without mutating input", () => {
  const source = [1, 2, 3, 4]; const result = fisherYates(source, seeded(3));
  assert.deepEqual(source, [1, 2, 3, 4]); assert.deepEqual([...result].sort(), source); assert.notDeepEqual(result, source);
});

test("original A correct remains semantically correct when moved to displayed C", () => {
  const source = question(1); const changed = applyPermanentOptionOrder(source, [1, 2, 0, 3]);
  assert.equal(changed.options[2], "1-A"); assert.deepEqual(changed.correctOptions, ["C"]);
});

test("69 four-option A-correct questions balance with difference at most one", () => {
  const questions = Array.from({ length: 69 }, (_, index) => question(index + 1));
  const attempt = createQuestionAttempt(questions, balanced, seeded(11)); const resolved = resolveQuestionAttempt(questions, attempt);
  const counts = [0, 0, 0, 0]; resolved.forEach((item) => counts[item.displayOptions.findIndex((option) => item.correctOptionIds.includes(option.id))] += 1);
  assert.equal(Math.max(...counts) - Math.min(...counts), 1); assert.equal(counts.reduce((sum, count) => sum + count, 0), 69);
});

test("balanced target order is not a repeating A-B-C-D pattern", () => {
  const questions = Array.from({ length: 68 }, (_, index) => question(index + 1));
  const resolved = resolveQuestionAttempt(questions, createQuestionAttempt(questions, balanced, seeded(29)));
  const positions = resolved.map((item) => item.displayOptions.findIndex((option) => item.correctOptionIds.includes(option.id)));
  assert.equal(positions.every((position, index) => position === index % 4), false);
});

test("persisted attempt validates and resolves to the same option order after reload", () => {
  const questions = [question(1), question(2)]; const attempt = createQuestionAttempt(questions, balanced, seeded(5));
  const restored = JSON.parse(JSON.stringify(attempt)); assert.equal(isQuestionAttemptValid(restored, questions, balanced), true);
  assert.deepEqual(resolveQuestionAttempt(questions, restored).map((item) => item.displayOptions.map((option) => option.id)), resolveQuestionAttempt(questions, attempt).map((item) => item.displayOptions.map((option) => option.id)));
});

test("different attempts can produce different question and option order", () => {
  const settings = { ...balanced, shuffleQuestions: true }; const questions = Array.from({ length: 12 }, (_, index) => question(index + 1));
  const first = createQuestionAttempt(questions, settings, seeded(1)); const second = createQuestionAttempt(questions, settings, seeded(2));
  assert.notDeepEqual({ q: first.questionIds, o: first.optionOrderByQuestion }, { q: second.questionIds, o: second.optionOrderByQuestion });
});

test("grading uses stable option identity after shuffle", () => {
  const source = question(7); const resolved = resolveQuestionAttempt([source], createQuestionAttempt([source], balanced, seeded(8)))[0];
  assert.equal(gradeStableOptions(resolved.correctOptionIds, [resolved.correctOptionIds[0]]), true);
  assert.equal(gradeStableOptions(resolved.correctOptionIds, [resolved.displayOptions.find((option) => !resolved.correctOptionIds.includes(option.id))!.id]), false);
});

test("question shuffle does not alter option correctness", () => {
  const settings = { shuffleQuestions: true, shuffleOptions: false, shuffleMode: "random" } as const; const questions = [question(1), question(2), question(3)];
  const resolved = resolveQuestionAttempt(questions, createQuestionAttempt(questions, settings, seeded(4)));
  resolved.forEach((item) => assert.equal(item.displayOptions[0].id, item.correctOptionIds[0]));
});

test("balanced shuffle supports two and five-option groups", () => {
  const questions = [...Array.from({ length: 9 }, (_, index) => question(index + 1, 2)), ...Array.from({ length: 11 }, (_, index) => question(index + 20, 5))];
  const resolved = resolveQuestionAttempt(questions, createQuestionAttempt(questions, balanced, seeded(17)));
  for (const size of [2, 5]) { const counts = Array(size).fill(0); resolved.filter((item) => item.options.length === size).forEach((item) => counts[item.displayOptions.findIndex((option) => item.correctOptionIds.includes(option.id))] += 1); assert.ok(Math.max(...counts) - Math.min(...counts) <= 1); }
});

test("multiple correct answers survive random fallback", () => {
  const source = question(9, 5, ["A", "C"]); const resolved = resolveQuestionAttempt([source], createQuestionAttempt([source], balanced, seeded(21)))[0];
  assert.deepEqual(new Set(resolved.correctOptionIds), new Set(["q9-opt0", "q9-opt2"]));
  assert.equal(gradeStableOptions(resolved.correctOptionIds, ["q9-opt2", "q9-opt0"]), true);
});

test("permanent plans remap every correct label without changing option text", () => {
  const source = question(4, 4, ["A", "C"]); const [plan] = planPermanentOptionShuffle([source], "random", seeded(6)); const changed = applyPermanentOptionOrder(source, plan.optionOrder);
  assert.deepEqual([...changed.options].sort(), [...source.options].sort());
  const correctTexts = changed.correctOptions.map((label) => changed.options[label.charCodeAt(0) - 65]); assert.deepEqual(new Set(correctTexts), new Set(["4-A", "4-C"]));
});
