export const SET_REVIEW_INTERVALS_DAYS = [1, 3, 7] as const;
export const DEFAULT_DAILY_REVIEW_WORDS = 40;
export const DAILY_REVIEW_OPTIONS = [20, 30, 40, 60, 80] as const;
const DAY_MS = 86_400_000;
function vietnamDayOrdinal(date: Date) {
  // Vietnam has used UTC+7 without daylight-saving changes in the supported
  // product timeline, so calendar-day ranking can stay allocation-free.
  return Math.floor((date.getTime() + 7 * 60 * 60 * 1000) / DAY_MS);
}

export type SetReviewStage = 1 | 2 | 3 | 4;
export type ReviewWord = {
  id: number;
  setId: number;
  setName: string;
  setCategory?: string | null;
  setType?: string;
  meaning?: string;
  term?: string | null;
  v1?: string | null;
  v2?: string | null;
  v3?: string | null;
  example?: string | null;
  wtype?: string | null;
  ipa?: string | null;
  known: boolean | null;
  nextReviewAt: Date | null;
  reviewStreak: number;
  correctCount: number;
  wrongCount: number;
  timesWrong: number;
};

export type DueSetReview = {
  setId: number;
  setName: string;
  setCategory?: string | null;
  stage: 1 | 2 | 3;
  nextReviewAt: Date;
  words: ReviewWord[];
};

export type PlannedWord = ReviewWord & {
  priorityScore: number;
  daysOverdue: number;
  reasons: Array<"overdue" | "due" | "difficult" | "forgotten" | "set_review">;
};

export type ReviewBatch = {
  setId: number;
  setName: string;
  setCategory?: string | null;
  reviewRound: 1 | 2 | 3 | null;
  words: PlannedWord[];
};

export type DailyReviewPlan = {
  wordBudget: number;
  completedToday: number;
  plannedWords: number;
  totalDueWords: number;
  overdueWords: number;
  dueSetReviews: number;
  estimatedMinutes: number;
  batches: ReviewBatch[];
  backlog: { words: number; sets: number };
};

export function addDays(from: Date, days: number) {
  return new Date(from.getTime() + days * DAY_MS);
}

export function startSetReview(completedAt = new Date()) {
  return { stage: 1 as const, nextReviewAt: addDays(completedAt, SET_REVIEW_INTERVALS_DAYS[0]) };
}

export function evaluateSetReviewResult(stage: 1 | 2 | 3, accuracy: number, completedAt = new Date()) {
  const normalized = Math.max(0, Math.min(1, accuracy));
  if (normalized < 0.6) {
    return { result: "fail" as const, stage, nextReviewAt: addDays(completedAt, 1), consolidated: false };
  }
  const nextStage = (stage + 1) as SetReviewStage;
  if (stage === 3) {
    return { result: normalized < 0.8 ? "weak_pass" as const : "pass" as const, stage: nextStage, nextReviewAt: null, consolidated: true };
  }
  const baseline = SET_REVIEW_INTERVALS_DAYS[stage];
  const interval = normalized < 0.8 ? Math.max(1, Math.round(baseline / 2)) : baseline;
  return {
    result: normalized < 0.8 ? "weak_pass" as const : "pass" as const,
    stage: nextStage,
    nextReviewAt: addDays(completedAt, interval),
    consolidated: false,
  };
}

function deterministicNoise(wordId: number, seed: number) {
  let value = (wordId * 2654435761 + seed * 1013904223) >>> 0;
  value ^= value >>> 16;
  return (value >>> 0) / 4294967295;
}

function weakness(word: ReviewWord, now: Date) {
  const due = Boolean(word.nextReviewAt && word.nextReviewAt <= now);
  return (due ? 500 : 0) + word.timesWrong * 45 + word.wrongCount * 12 + (word.known === false ? 180 : 0) + Math.max(0, 5 - word.reviewStreak) * 4;
}

export function selectSetReviewWords(review: DueSetReview, now = new Date()) {
  const count = review.words.length;
  const target = review.stage === 1
    ? (count <= 20 ? count : Math.min(25, count))
    : review.stage === 2
      ? Math.min(20, Math.max(Math.min(count, 10), Math.round(count * 0.45)))
      : Math.min(15, Math.max(Math.min(count, 8), Math.round(count * 0.32)));
  const seed = Math.floor(now.getTime() / DAY_MS) + review.setId * 31 + review.stage * 997;
  return [...review.words]
    .sort((a, b) => {
      const weakDifference = weakness(b, now) - weakness(a, now);
      if (weakDifference) return weakDifference;
      return deterministicNoise(a.id, seed) - deterministicNoise(b.id, seed);
    })
    .slice(0, target);
}

export function rankReviewCandidate(word: ReviewWord, now = new Date(), setReview?: DueSetReview) {
  const due = Boolean(word.nextReviewAt && word.nextReviewAt <= now);
  const daysOverdue = due && word.nextReviewAt ? Math.max(0, vietnamDayOrdinal(now) - vietnamDayOrdinal(word.nextReviewAt)) : 0;
  const reasons: PlannedWord["reasons"] = [];
  if (due) reasons.push(daysOverdue > 0 ? "overdue" : "due");
  if (word.timesWrong > 0 || word.wrongCount > 0) reasons.push("difficult");
  if (word.known === false) reasons.push("forgotten");
  if (setReview) reasons.push("set_review");
  const priorityScore =
    (due ? 1_000 : 0) + daysOverdue * 35 +
    word.timesWrong * 55 + word.wrongCount * 15 +
    (word.known === false ? 170 : 0) + Math.max(0, 4 - word.reviewStreak) * 8 +
    (setReview ? 720 + Math.floor(Math.max(0, now.getTime() - setReview.nextReviewAt.getTime()) / DAY_MS) * 18 : 0);
  return { ...word, priorityScore, daysOverdue, reasons };
}

export function buildDailyReviewPlan(input: {
  dueWords: ReviewWord[];
  dueSetReviews: DueSetReview[];
  wordBudget?: number;
  completedToday?: number;
  now?: Date;
  extra?: boolean;
}): DailyReviewPlan {
  const now = input.now || new Date();
  const budget = Math.max(1, input.wordBudget || DEFAULT_DAILY_REVIEW_WORDS);
  const completedToday = Math.max(0, input.completedToday || 0);
  const remainingBudget = input.extra ? budget : Math.max(0, budget - completedToday);
  const candidates = new Map<number, PlannedWord>();
  const sampleIdsBySet = new Map<number, Set<number>>();
  const setReviewBySet = new Map(input.dueSetReviews.map((review) => [review.setId, review]));

  for (const word of input.dueWords) candidates.set(word.id, rankReviewCandidate(word, now));
  for (const review of input.dueSetReviews) {
    const selected = selectSetReviewWords(review, now);
    sampleIdsBySet.set(review.setId, new Set(selected.map((word) => word.id)));
    for (const word of selected) {
      const ranked = rankReviewCandidate(word, now, review);
      const previous = candidates.get(word.id);
      if (!previous || ranked.priorityScore > previous.priorityScore) candidates.set(word.id, ranked);
      else candidates.set(word.id, { ...previous, reasons: [...new Set([...previous.reasons, "set_review" as const])] });
    }
  }

  const all = [...candidates.values()].sort((a, b) => b.priorityScore - a.priorityScore || a.setId - b.setId || a.id - b.id);
  const selected = all.slice(0, remainingBudget);
  const selectedIds = new Set(selected.map((word) => word.id));
  const batchesBySet = new Map<number, ReviewBatch>();
  for (const word of selected) {
    let batch = batchesBySet.get(word.setId);
    if (!batch) {
      const sample = sampleIdsBySet.get(word.setId);
      const fullyCoversCheckpoint = Boolean(sample?.size && [...sample].every((id) => selectedIds.has(id)));
      const review = setReviewBySet.get(word.setId);
      batch = { setId: word.setId, setName: word.setName, setCategory: word.setCategory, reviewRound: fullyCoversCheckpoint && review ? review.stage : null, words: [] };
      batchesBySet.set(word.setId, batch);
    }
    batch.words.push(word);
  }
  const batches = [...batchesBySet.values()].sort((a, b) => (b.words[0]?.priorityScore || 0) - (a.words[0]?.priorityScore || 0));
  const coveredSets = new Set(batches.filter((batch) => batch.reviewRound).map((batch) => batch.setId));
  const overdueWords = selected.filter((word) => word.daysOverdue > 0).length;
  return {
    wordBudget: budget,
    completedToday,
    plannedWords: selected.length,
    totalDueWords: all.length,
    overdueWords,
    dueSetReviews: input.dueSetReviews.length,
    estimatedMinutes: selected.length ? Math.max(1, Math.round(selected.length / 5)) : 0,
    batches,
    backlog: { words: Math.max(0, all.length - selected.length), sets: Math.max(0, input.dueSetReviews.length - coveredSets.size) },
  };
}
