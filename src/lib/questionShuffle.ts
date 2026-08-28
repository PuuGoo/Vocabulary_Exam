export type QuestionShuffleMode = "random" | "balanced";

export type QuestionShuffleSettings = {
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  shuffleMode: QuestionShuffleMode;
};

export const DEFAULT_QUESTION_SHUFFLE_SETTINGS: QuestionShuffleSettings = {
  shuffleQuestions: false,
  shuffleOptions: false,
  shuffleMode: "random",
};

export type ShuffleQuestion = {
  id: number;
  options: string[];
  correctOption?: string | null;
  correctOptions?: string[];
};

export type StableOption = { id: string; text: string; originalIndex: number };

export type QuestionAttempt = {
  version: 1;
  attemptId: string;
  signature: string;
  questionIds: number[];
  optionOrderByQuestion: Record<number, string[]>;
};

export type AttemptQuestion<T extends ShuffleQuestion> = T & {
  displayOptions: StableOption[];
  correctOptionIds: string[];
};

export type PermanentShufflePlan = {
  id: number;
  optionOrder: number[];
  beforeCorrectPositions: number[];
  afterCorrectPositions: number[];
};

export function optionLetter(index: number) {
  return String.fromCharCode(65 + index);
}

export function stableOptionId(questionId: number, originalIndex: number) {
  return `q${questionId}-opt${originalIndex}`;
}

export function fisherYates<T>(values: readonly T[], random: () => number = Math.random): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function correctIndices(question: ShuffleQuestion) {
  const labels = question.correctOptions?.length ? question.correctOptions : question.correctOption ? [question.correctOption] : [];
  return [...new Set(labels.map((label) => label.charCodeAt(0) - 65).filter((index) => index >= 0 && index < question.options.length))];
}

function stableOptions(question: ShuffleQuestion): StableOption[] {
  return question.options.map((text, originalIndex) => ({ id: stableOptionId(question.id, originalIndex), text, originalIndex }));
}

function isRepeatingPositionPattern(values: number[], optionCount: number) {
  return values.length >= optionCount * 2 && values.every((value, index) => value === index % optionCount);
}

function balancedTargets(count: number, optionCount: number, random: () => number) {
  const base = Math.floor(count / optionCount);
  const remainder = count % optionCount;
  const extraPositions = new Set(fisherYates(Array.from({ length: optionCount }, (_, index) => index), random).slice(0, remainder));
  const pool: number[] = [];
  for (let position = 0; position < optionCount; position += 1) {
    for (let amount = 0; amount < base + (extraPositions.has(position) ? 1 : 0); amount += 1) pool.push(position);
  }
  const shuffled = fisherYates(pool, random);
  if (isRepeatingPositionPattern(shuffled, optionCount)) {
    const swapIndex = shuffled.findIndex((value, index) => index > 0 && value !== shuffled[0]);
    if (swapIndex > 0) [shuffled[0], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[0]];
  }
  return shuffled;
}

function buildBalancedTargetMap(questions: ShuffleQuestion[], random: () => number) {
  const targets = new Map<number, number>();
  const groups = new Map<number, ShuffleQuestion[]>();
  for (const question of questions) {
    if (question.options.length < 2 || correctIndices(question).length !== 1) continue;
    const group = groups.get(question.options.length) || [];
    group.push(question);
    groups.set(question.options.length, group);
  }
  for (const [optionCount, group] of groups) {
    const positions = balancedTargets(group.length, optionCount, random);
    group.forEach((question, index) => targets.set(question.id, positions[index]));
  }
  return targets;
}

function optionOrder(question: ShuffleQuestion, targetCorrectPosition: number | undefined, random: () => number) {
  const indices = question.options.map((_, index) => index);
  const correct = correctIndices(question);
  if (targetCorrectPosition === undefined || correct.length !== 1) return fisherYates(indices, random);
  const [correctIndex] = correct;
  const wrong = fisherYates(indices.filter((index) => index !== correctIndex), random);
  wrong.splice(targetCorrectPosition, 0, correctIndex);
  return wrong;
}

export function questionAttemptSignature(questions: ShuffleQuestion[], settings: QuestionShuffleSettings) {
  const content = questions.map((question) => `${question.id}:${question.options.join("\u001f")}:${correctIndices(question).join(",")}`).join("\u001e");
  return `${settings.shuffleQuestions ? 1 : 0}:${settings.shuffleOptions ? 1 : 0}:${settings.shuffleMode}:${content}`;
}

export function createQuestionAttempt(questions: ShuffleQuestion[], settings: QuestionShuffleSettings, random: () => number = Math.random, now = Date.now()): QuestionAttempt {
  const targets = settings.shuffleOptions && settings.shuffleMode === "balanced" ? buildBalancedTargetMap(questions, random) : new Map<number, number>();
  const questionIds = settings.shuffleQuestions ? fisherYates(questions.map((question) => question.id), random) : questions.map((question) => question.id);
  const optionOrderByQuestion: Record<number, string[]> = {};
  for (const question of questions) {
    const order = settings.shuffleOptions ? optionOrder(question, targets.get(question.id), random) : question.options.map((_, index) => index);
    optionOrderByQuestion[question.id] = order.map((originalIndex) => stableOptionId(question.id, originalIndex));
  }
  return { version: 1, attemptId: `${now}-${Math.floor(random() * 1_000_000_000)}`, signature: questionAttemptSignature(questions, settings), questionIds, optionOrderByQuestion };
}

export function isQuestionAttemptValid(attempt: unknown, questions: ShuffleQuestion[], settings: QuestionShuffleSettings): attempt is QuestionAttempt {
  if (!attempt || typeof attempt !== "object") return false;
  const value = attempt as QuestionAttempt;
  if (value.version !== 1 || value.signature !== questionAttemptSignature(questions, settings) || value.questionIds.length !== questions.length) return false;
  const questionIds = new Set(questions.map((question) => question.id));
  if (new Set(value.questionIds).size !== questions.length || value.questionIds.some((id) => !questionIds.has(id))) return false;
  return questions.every((question) => {
    const expected = stableOptions(question).map((option) => option.id);
    const actual = value.optionOrderByQuestion[question.id] || [];
    return actual.length === expected.length && new Set(actual).size === expected.length && actual.every((id) => expected.includes(id));
  });
}

export function resolveQuestionAttempt<T extends ShuffleQuestion>(questions: T[], attempt: QuestionAttempt): AttemptQuestion<T>[] {
  const byId = new Map(questions.map((question) => [question.id, question]));
  return attempt.questionIds.flatMap((id) => {
    const question = byId.get(id);
    if (!question) return [];
    const options = stableOptions(question);
    const optionById = new Map(options.map((option) => [option.id, option]));
    const displayOptions = (attempt.optionOrderByQuestion[id] || options.map((option) => option.id)).flatMap((optionId) => {
      const option = optionById.get(optionId);
      return option ? [option] : [];
    });
    const correctOptionIds = correctIndices(question).map((index) => stableOptionId(question.id, index));
    return [{ ...question, displayOptions, correctOptionIds }];
  });
}

export function gradeStableOptions(expected: readonly string[], selected: readonly string[]) {
  return expected.length === selected.length && expected.every((id) => selected.includes(id));
}

export function planPermanentOptionShuffle(questions: ShuffleQuestion[], mode: QuestionShuffleMode, random: () => number = Math.random): PermanentShufflePlan[] {
  const targets = mode === "balanced" ? buildBalancedTargetMap(questions, random) : new Map<number, number>();
  return questions.filter((question) => question.options.length >= 2).map((question) => {
    const plannedOrder = optionOrder(question, targets.get(question.id), random);
    const originals = correctIndices(question);
    return { id: question.id, optionOrder: plannedOrder, beforeCorrectPositions: originals, afterCorrectPositions: originals.map((original) => plannedOrder.indexOf(original)).sort((a, b) => a - b) };
  });
}

export function correctAnswerDistribution(questions: ShuffleQuestion[], plans?: PermanentShufflePlan[]) {
  const planById = new Map((plans || []).map((plan) => [plan.id, plan]));
  const distribution: Record<string, number> = {};
  for (const question of questions) {
    const positions = planById.get(question.id)?.afterCorrectPositions || correctIndices(question);
    positions.forEach((position) => { const label = optionLetter(position); distribution[label] = (distribution[label] || 0) + 1; });
  }
  return distribution;
}

export function applyPermanentOptionOrder(question: ShuffleQuestion, optionOrder: number[]) {
  const expected = question.options.map((_, index) => index);
  if (optionOrder.length !== expected.length || new Set(optionOrder).size !== expected.length || optionOrder.some((index) => !expected.includes(index))) throw new Error("INVALID_OPTION_ORDER");
  const correct = correctIndices(question);
  const correctOptions = correct.map((original) => optionLetter(optionOrder.indexOf(original))).sort();
  return { options: optionOrder.map((index) => question.options[index]), correctOptions, correctOption: correctOptions[0] || null };
}
