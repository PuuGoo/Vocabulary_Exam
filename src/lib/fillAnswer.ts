export type FillSessionKind = "practice" | "test";

export type FillRecallOutcome = {
  wordId: number;
  firstAnswer: string;
  firstTryCorrect: boolean;
  correctAfterHint: boolean;
  hintLevelUsed: number;
  audioBeforeAnswer: boolean;
  corrected: boolean;
  retryCount: number;
  finalCorrect: boolean;
};

export type FillDraft = {
  version: 2;
  savedAt: number;
  wordIds: number[];
  group: number;
  queues: Record<number, number[]>;
  cursors: Record<number, number>;
  answers: Record<number, string>;
  outcomes: Record<number, FillRecallOutcome>;
  hintLevels: Record<number, number>;
  audioBeforeAnswer: Record<number, boolean>;
  groupResults: Record<number, FillAttemptSummary>;
  phase: "questions" | "group_result" | "complete";
};

export type FillAttemptSummary = {
  total: number;
  firstTryCorrect: number;
  assisted: number;
  firstAttemptWrong: number;
  corrected: number;
  finalCorrect: number;
  weakWordIds: number[];
};

export function normalizeFillAnswer(value: string | null | undefined) {
  return (value || "").normalize("NFC").trim().toLocaleLowerCase("en").replace(/\s+/g, " ");
}

/**
 * Preserve the project's existing slash convention while also accepting a
 * readable whole-answer form such as "refrigerator / fridge".
 */
export function getAcceptedAnswers(answerKey: string | null | undefined): string[] {
  const raw = (answerKey || "").trim();
  if (!raw) return [];
  const wholeAlternatives = raw.split(/\s+[|;/]\s+/).map((item) => item.trim()).filter(Boolean);
  const phrases = wholeAlternatives.length > 1 ? wholeAlternatives : [raw];
  const expanded = phrases.flatMap((phrase) => {
    const tokens = phrase.split(/\s+/);
    let results = [""];
    for (const token of tokens) {
      const alternatives = token.split("/").map((item) => item.trim()).filter(Boolean);
      results = results.flatMap((result) => alternatives.map((alternative) => `${result} ${alternative}`.trim()));
    }
    return results;
  });
  return [...new Set(expanded.map(normalizeFillAnswer).filter(Boolean))];
}

export function getTypoDistance(left: string, right: string) {
  const a = normalizeFillAnswer(left);
  const b = normalizeFillAnswer(right);
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[b.length];
}

export function gradeFillAnswer(userAnswer: string, answerKey: string | null | undefined) {
  const normalized = normalizeFillAnswer(userAnswer);
  const acceptedAnswers = getAcceptedAnswers(answerKey);
  const correct = Boolean(normalized) && acceptedAnswers.includes(normalized);
  const nearestDistance = acceptedAnswers.length
    ? Math.min(...acceptedAnswers.map((answer) => getTypoDistance(normalized, answer)))
    : Number.POSITIVE_INFINITY;
  const nearestLength = acceptedAnswers.reduce((length, answer) => Math.max(length, answer.length), 0);
  const nearMissThreshold = nearestLength >= 6 ? 2 : 1;
  return { correct, nearMiss: !correct && Boolean(normalized) && nearestDistance <= nearMissThreshold, acceptedAnswers };
}

export function maskAnswerInExample(example: string | null | undefined, answerKey: string | null | undefined) {
  let result = example || "";
  const variants = getAcceptedAnswers(answerKey).sort((a, b) => b.length - a.length);
  for (const variant of variants) {
    const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`\\b${escaped}\\b`, "giu"), "______");
  }
  return result;
}

export function getProgressiveHint(answerKey: string | null | undefined, level: number, example?: string | null) {
  const answer = getAcceptedAnswers(answerKey)[0] || "";
  if (level <= 0 || !answer) return null;
  if (level === 1) {
    return { label: "Độ dài từ", value: `${[...answer].map((character) => character === " " ? " " : "_").join(" ")} · ${answer.length} ký tự`, revealed: false };
  }
  if (level === 2) {
    return { label: "Chữ đầu", value: [...answer].map((character, index) => character === " " ? " " : index === 0 ? character : "_").join(" "), revealed: false };
  }
  if (level === 3) {
    return { label: "Ngữ cảnh", value: example ? maskAnswerInExample(example, answerKey) : "Không có câu ví dụ cho từ này.", revealed: false };
  }
  return { label: "Đáp án", value: getAcceptedAnswers(answerKey).join(" / "), revealed: true };
}

export function canPlayTargetAudioBeforeAnswer(sessionKind: FillSessionKind) {
  return sessionKind === "practice";
}

export function claimFillAction(lock: { current: boolean }) {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function createFirstRecallOutcome(input: {
  wordId: number;
  answer: string;
  answerKey: string | null | undefined;
  hintLevelUsed: number;
  audioBeforeAnswer: boolean;
}): FillRecallOutcome {
  const grade = gradeFillAnswer(input.answer, input.answerKey);
  const assisted = input.hintLevelUsed > 0 || input.audioBeforeAnswer;
  return {
    wordId: input.wordId,
    firstAnswer: input.answer,
    firstTryCorrect: grade.correct && !assisted,
    correctAfterHint: grade.correct && assisted,
    hintLevelUsed: input.hintLevelUsed,
    audioBeforeAnswer: input.audioBeforeAnswer,
    corrected: false,
    retryCount: 0,
    finalCorrect: grade.correct,
  };
}

export function summarizeFillAttempts(outcomes: FillRecallOutcome[], originalWordIds: number[]): FillAttemptSummary {
  const byWord = new Map(outcomes.map((outcome) => [outcome.wordId, outcome]));
  const original = originalWordIds.map((wordId) => byWord.get(wordId)).filter((item): item is FillRecallOutcome => Boolean(item));
  return {
    total: originalWordIds.length,
    firstTryCorrect: original.filter((item) => item.firstTryCorrect).length,
    assisted: original.filter((item) => item.correctAfterHint).length,
    firstAttemptWrong: original.filter((item) => !item.firstTryCorrect && !item.correctAfterHint).length,
    corrected: original.filter((item) => item.corrected).length,
    finalCorrect: original.filter((item) => item.finalCorrect).length,
    weakWordIds: original.filter((item) => !item.firstTryCorrect).map((item) => item.wordId),
  };
}

export function scheduleDelayedRetry(queue: number[], wordId: number, currentIndex: number, spacing = 4) {
  const withoutDuplicate = queue.filter((id, index) => id !== wordId || index <= currentIndex);
  const insertionIndex = Math.min(withoutDuplicate.length, currentIndex + Math.max(3, spacing) + 1);
  return [...withoutDuplicate.slice(0, insertionIndex), wordId, ...withoutDuplicate.slice(insertionIndex)];
}

export function chunkFillItems<T>(items: T[], groupSize = 10) {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += groupSize) groups.push(items.slice(index, index + groupSize));
  return groups;
}

export function visibleFillItems<T>(items: T[], view: "focus" | "list", currentIndex: number) {
  return view === "focus" ? items.slice(currentIndex, currentIndex + 1) : items;
}

export function isValidFillDraft(value: unknown, wordIds: number[], now = Date.now()): value is FillDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<FillDraft>;
  return draft.version === 2
    && Number.isFinite(draft.savedAt)
    && Number(draft.savedAt) <= now
    && now - Number(draft.savedAt) < 24 * 60 * 60 * 1000
    && Array.isArray(draft.wordIds)
    && draft.wordIds.length === wordIds.length
    && draft.wordIds.every((id, index) => id === wordIds[index])
    && Number.isInteger(draft.group)
    && typeof draft.answers === "object"
    && typeof draft.outcomes === "object";
}
