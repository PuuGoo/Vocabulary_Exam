import { and, eq, gt, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  classMembers, learningGoals, mistakes, reviewSessions, setReviewProgress,
  vocabSets, wordProgress, words,
} from "@/db/schema";
import { nextSpacedProgress } from "@/lib/spacedRepetition";
import {
  addDays, buildDailyReviewPlan, DEFAULT_DAILY_REVIEW_WORDS, evaluateSetReviewResult,
  selectSetReviewWords, startSetReview, type DueSetReview, type ReviewWord,
} from "@/lib/reviewPlanner";
import { dateInVietnam } from "@/lib/activity";

// Keep candidate scans lean: a user can have thousands of due words and the
// planner only needs scheduling metadata to rank them. Full card content is
// hydrated after the daily budget has selected the small final set.
const wordCandidateSelection = {
  id: words.id, setId: words.setId, setName: vocabSets.name, setCategory: vocabSets.category,
  setType: vocabSets.type,
  known: wordProgress.known, nextReviewAt: wordProgress.nextReviewAt,
  reviewStreak: wordProgress.reviewStreak, correctCount: wordProgress.correctCount,
  wrongCount: wordProgress.wrongCount, timesWrong: mistakes.timesWrong,
};

const wordDetailSelection = {
  id: words.id, meaning: words.meaning, term: words.term, v1: words.v1, v2: words.v2,
  v3: words.v3, example: words.example, wtype: words.wtype, ipa: words.ipa,
};

function normalizeWord(row: Record<string, unknown>): ReviewWord {
  return {
    ...(row as unknown as Omit<ReviewWord, "reviewStreak" | "correctCount" | "wrongCount" | "timesWrong">),
    reviewStreak: Number(row.reviewStreak || 0), correctCount: Number(row.correctCount || 0),
    wrongCount: Number(row.wrongCount || 0), timesWrong: Number(row.timesWrong || 0),
  };
}

async function accessFilter(userId: number, role: string) {
  if (role === "admin") return undefined;
  const memberships = await db.select({ classId: classMembers.classId }).from(classMembers).where(eq(classMembers.userId, userId));
  const classIds = memberships.map((item) => item.classId);
  return classIds.length ? or(isNull(vocabSets.classId), inArray(vocabSets.classId, classIds)) : isNull(vocabSets.classId);
}

export async function buildReviewPlanForUser(userId: number, role: string, options?: { extra?: boolean; now?: Date }) {
  const now = options?.now || new Date();
  const todayStart = new Date(`${dateInVietnam(now)}T00:00:00+07:00`);
  const tomorrowStart = addDays(todayStart, 1);
  const allowed = await accessFilter(userId, role);
  const dueWordWhere = and(eq(wordProgress.userId, userId), lte(wordProgress.nextReviewAt, now), allowed);
  const dueSetWhere = and(eq(setReviewProgress.userId, userId), lte(setReviewProgress.nextReviewAt, now), sql`${setReviewProgress.stage} between 1 and 3`, allowed);

  const [dueWordRows, dueSetRows, goalRows, completedRows] = await Promise.all([
    db.select(wordCandidateSelection).from(wordProgress)
      .innerJoin(words, eq(words.id, wordProgress.wordId)).innerJoin(vocabSets, eq(vocabSets.id, words.setId))
      .leftJoin(mistakes, and(eq(mistakes.userId, userId), eq(mistakes.wordId, words.id)))
      .where(dueWordWhere),
    db.select({ setId: setReviewProgress.setId, setName: vocabSets.name, setCategory: vocabSets.category, stage: setReviewProgress.stage, nextReviewAt: setReviewProgress.nextReviewAt })
      .from(setReviewProgress).innerJoin(vocabSets, eq(vocabSets.id, setReviewProgress.setId)).where(dueSetWhere),
    db.select({ dailyReviewWords: learningGoals.dailyReviewWords }).from(learningGoals).where(eq(learningGoals.userId, userId)).limit(1),
    db.select({ count: sql<number>`coalesce(sum(${reviewSessions.wordCount}), 0)::int` }).from(reviewSessions)
      .where(and(eq(reviewSessions.userId, userId), gte(reviewSessions.completedAt, todayStart), lt(reviewSessions.completedAt, tomorrowStart))),
  ]);

  let dueSetReviews: DueSetReview[] = [];
  if (dueSetRows.length) {
    const setIds = dueSetRows.map((item) => item.setId);
    const setWordRows = await db.select(wordCandidateSelection).from(words)
      .innerJoin(vocabSets, eq(vocabSets.id, words.setId))
      .leftJoin(wordProgress, and(eq(wordProgress.userId, userId), eq(wordProgress.wordId, words.id)))
      .leftJoin(mistakes, and(eq(mistakes.userId, userId), eq(mistakes.wordId, words.id)))
      .where(and(inArray(words.setId, setIds), allowed));
    const bySet = new Map<number, ReviewWord[]>();
    for (const row of setWordRows) {
      const item = normalizeWord(row as unknown as Record<string, unknown>);
      bySet.set(item.setId, [...(bySet.get(item.setId) || []), item]);
    }
    dueSetReviews = dueSetRows.map((item) => ({
      setId: item.setId, setName: item.setName, setCategory: item.setCategory,
      stage: item.stage as 1 | 2 | 3, nextReviewAt: item.nextReviewAt!, words: bySet.get(item.setId) || [],
    }));
  }

  const plan = buildDailyReviewPlan({
    dueWords: dueWordRows.map((row) => normalizeWord(row as unknown as Record<string, unknown>)),
    dueSetReviews, wordBudget: goalRows[0]?.dailyReviewWords || DEFAULT_DAILY_REVIEW_WORDS,
    completedToday: completedRows[0]?.count || 0, now, extra: options?.extra,
  });
  const selectedIds = plan.batches.flatMap((batch) => batch.words.map((word) => word.id));
  if (!selectedIds.length) return plan;
  const details = await db.select(wordDetailSelection).from(words).where(inArray(words.id, selectedIds));
  const detailsById = new Map(details.map((item) => [item.id, item]));
  return {
    ...plan,
    batches: plan.batches.map((batch) => ({
      ...batch,
      words: batch.words.map((word) => ({ ...word, ...detailsById.get(word.id) })),
    })),
  };
}

export async function getUpcomingReviewOverview(userId: number, role: string, todayCount: number, now = new Date()) {
  const allowed = await accessFilter(userId, role);
  const end = addDays(now, 7);
  const [futureWordRows, futureSetRows] = await Promise.all([
    db.select(wordCandidateSelection).from(wordProgress)
      .innerJoin(words, eq(words.id, wordProgress.wordId)).innerJoin(vocabSets, eq(vocabSets.id, words.setId))
      .leftJoin(mistakes, and(eq(mistakes.userId, userId), eq(mistakes.wordId, words.id)))
      .where(and(eq(wordProgress.userId, userId), gt(wordProgress.nextReviewAt, now), lte(wordProgress.nextReviewAt, end), allowed)),
    db.select({ setId: setReviewProgress.setId, setName: vocabSets.name, setCategory: vocabSets.category, stage: setReviewProgress.stage, nextReviewAt: setReviewProgress.nextReviewAt })
      .from(setReviewProgress).innerJoin(vocabSets, eq(vocabSets.id, setReviewProgress.setId))
      .where(and(eq(setReviewProgress.userId, userId), gt(setReviewProgress.nextReviewAt, now), lte(setReviewProgress.nextReviewAt, end), sql`${setReviewProgress.stage} between 1 and 3`, allowed)),
  ]);
  const setWords = futureSetRows.length ? await db.select(wordCandidateSelection).from(words)
    .innerJoin(vocabSets, eq(vocabSets.id, words.setId))
    .leftJoin(wordProgress, and(eq(wordProgress.userId, userId), eq(wordProgress.wordId, words.id)))
    .leftJoin(mistakes, and(eq(mistakes.userId, userId), eq(mistakes.wordId, words.id)))
    .where(and(inArray(words.setId, futureSetRows.map((item) => item.setId)), allowed)) : [];
  const wordsBySet = new Map<number, ReviewWord[]>();
  for (const row of setWords) { const item = normalizeWord(row as unknown as Record<string, unknown>); wordsBySet.set(item.setId, [...(wordsBySet.get(item.setId) || []), item]); }
  const idsByDate = new Map<string, Set<number>>();
  for (const row of futureWordRows) {
    if (!row.nextReviewAt) continue;
    const key = dateInVietnam(row.nextReviewAt); const ids = idsByDate.get(key) || new Set<number>(); ids.add(row.id); idsByDate.set(key, ids);
  }
  for (const row of futureSetRows) {
    if (!row.nextReviewAt) continue;
    const key = dateInVietnam(row.nextReviewAt); const ids = idsByDate.get(key) || new Set<number>();
    const checkpoint: DueSetReview = { setId: row.setId, setName: row.setName, setCategory: row.setCategory, stage: row.stage as 1 | 2 | 3, nextReviewAt: row.nextReviewAt, words: wordsBySet.get(row.setId) || [] };
    for (const item of selectSetReviewWords(checkpoint, row.nextReviewAt)) ids.add(item.id);
    idsByDate.set(key, ids);
  }
  return Array.from({ length: 7 }, (_, offset) => {
    const date = dateInVietnam(addDays(now, offset));
    return { date, count: offset === 0 ? todayCount : idsByDate.get(date)?.size || 0 };
  });
}

export async function initializeSetReview(userId: number, role: string, setId: number, completedAt = new Date()) {
  const allowed = await accessFilter(userId, role);
  const [set] = await db.select({ id: vocabSets.id }).from(vocabSets).where(and(eq(vocabSets.id, setId), allowed)).limit(1);
  if (!set) throw new Error("SET_NOT_FOUND");
  const initial = startSetReview(completedAt);
  const [created] = await db.insert(setReviewProgress).values({
    userId, setId, stage: initial.stage, initialCompletedAt: completedAt, nextReviewAt: initial.nextReviewAt,
  }).onConflictDoNothing({ target: [setReviewProgress.userId, setReviewProgress.setId] }).returning();
  const progress = created || (await db.select().from(setReviewProgress).where(and(eq(setReviewProgress.userId, userId), eq(setReviewProgress.setId, setId))).limit(1))[0];
  return { progress, created: Boolean(created) };
}

export type CompleteReviewInput = {
  idempotencyKey: string;
  setId: number;
  expectedStage: 1 | 2 | 3 | null;
  outcomes: Array<{ wordId: number; correct: boolean }>;
};

export async function completeReviewBatch(userId: number, role: string, input: CompleteReviewInput, completedAt = new Date()) {
  const allowed = await accessFilter(userId, role);
  const [accessibleSet] = await db.select({ id: vocabSets.id }).from(vocabSets).where(and(eq(vocabSets.id, input.setId), allowed)).limit(1);
  if (!accessibleSet) throw new Error("SET_NOT_FOUND");
  const outcomes = [...new Map(input.outcomes.map((item) => [item.wordId, item])).values()];
  if (!outcomes.length) throw new Error("EMPTY_SESSION");

  return db.transaction(async (tx) => {
    const [alreadyCompleted] = await tx.select({ id: reviewSessions.id }).from(reviewSessions).where(and(
      eq(reviewSessions.userId, userId), eq(reviewSessions.idempotencyKey, input.idempotencyKey),
    )).limit(1);
    if (alreadyCompleted) return { duplicate: true };
    if (input.expectedStage) {
      const [progress] = await tx.select().from(setReviewProgress).where(and(
        eq(setReviewProgress.userId, userId), eq(setReviewProgress.setId, input.setId), eq(setReviewProgress.stage, input.expectedStage),
      )).limit(1);
      if (!progress) throw new Error("STALE_STAGE");
    }
    const [session] = await tx.insert(reviewSessions).values({
      userId, idempotencyKey: input.idempotencyKey,
      sessionType: input.expectedStage ? "mixed_review" : "word_srs",
      setId: input.setId, setReviewStage: input.expectedStage,
      wordCount: outcomes.length, correctCount: outcomes.filter((item) => item.correct).length, completedAt,
    }).onConflictDoNothing({ target: [reviewSessions.userId, reviewSessions.idempotencyKey] }).returning();
    if (!session) return { duplicate: true };

    const validWords = await tx.select({ id: words.id }).from(words).where(and(eq(words.setId, input.setId), inArray(words.id, outcomes.map((item) => item.wordId))));
    if (validWords.length !== outcomes.length) throw new Error("INVALID_WORDS");
    const existing = await tx.select().from(wordProgress).where(and(eq(wordProgress.userId, userId), inArray(wordProgress.wordId, outcomes.map((item) => item.wordId))));
    const byWord = new Map(existing.map((item) => [item.wordId, item]));
    for (const outcome of outcomes) {
      const next = nextSpacedProgress(byWord.get(outcome.wordId), outcome.correct, completedAt);
      await tx.insert(wordProgress).values({ userId, wordId: outcome.wordId, ...next, lastMode: "review_today" }).onConflictDoUpdate({
        target: [wordProgress.userId, wordProgress.wordId], set: { ...next, lastMode: "review_today" },
      });
      if (!outcome.correct) await tx.insert(mistakes).values({ userId, wordId: outcome.wordId, setId: input.setId, timesWrong: 1, lastWrongAt: completedAt }).onConflictDoUpdate({
        target: [mistakes.userId, mistakes.wordId], set: { timesWrong: sql`${mistakes.timesWrong} + 1`, lastWrongAt: completedAt },
      });
    }

    let setResult = null;
    if (input.expectedStage) {
      const accuracy = outcomes.filter((item) => item.correct).length / outcomes.length;
      setResult = evaluateSetReviewResult(input.expectedStage, accuracy, completedAt);
      const completionField = setResult.result === "fail" ? {} : input.expectedStage === 1 ? { review1CompletedAt: completedAt } : input.expectedStage === 2 ? { review2CompletedAt: completedAt } : { review3CompletedAt: completedAt };
      const [updated] = await tx.update(setReviewProgress).set({
        stage: setResult.stage, nextReviewAt: setResult.nextReviewAt, lastReviewAt: completedAt,
        lastAccuracy: Math.round(accuracy * 100), updatedAt: completedAt, ...completionField,
      }).where(and(eq(setReviewProgress.userId, userId), eq(setReviewProgress.setId, input.setId), eq(setReviewProgress.stage, input.expectedStage))).returning();
      if (!updated) throw new Error("STALE_STAGE");
    }
    return { duplicate: false, setResult };
  });
}
