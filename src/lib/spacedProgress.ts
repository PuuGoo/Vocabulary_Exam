import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { wordProgress, words } from "@/db/schema";
import { nextSpacedProgress } from "@/lib/spacedRepetition";

export type WordOutcome = { wordId: number; setId?: number; correct: boolean };

export async function recordWordOutcomes(userId: number, outcomes: WordOutcome[], mode: string) {
  const deduplicated = [...new Map(outcomes.map((item) => [item.wordId, item])).values()];
  if (!deduplicated.length) return 0;

  const validWords = await db.select({ id: words.id, setId: words.setId })
    .from(words)
    .where(inArray(words.id, deduplicated.map((item) => item.wordId)));
  const validIds = new Set(validWords.filter((word) => {
    const submitted = deduplicated.find((item) => item.wordId === word.id);
    return submitted && (submitted.setId === undefined || submitted.setId === word.setId);
  }).map((word) => word.id));
  const validOutcomes = deduplicated.filter((item) => validIds.has(item.wordId));
  if (!validOutcomes.length) return 0;

  const existing = await db.select().from(wordProgress).where(and(
    eq(wordProgress.userId, userId),
    inArray(wordProgress.wordId, validOutcomes.map((item) => item.wordId))
  ));
  const previousByWord = new Map(existing.map((item) => [item.wordId, item]));
  const reviewedAt = new Date();

  const nextRows = validOutcomes.map((outcome) => {
    const next = nextSpacedProgress(previousByWord.get(outcome.wordId), outcome.correct, reviewedAt);
    return {
      userId,
      wordId: outcome.wordId,
      ...next,
      lastMode: mode,
    };
  });
  await db.insert(wordProgress).values(nextRows).onConflictDoUpdate({
    target: [wordProgress.userId, wordProgress.wordId],
    set: {
      known: sql`excluded.known`, intervalDays: sql`excluded.interval_days`, reviewStreak: sql`excluded.review_streak`,
      correctCount: sql`excluded.correct_count`, wrongCount: sql`excluded.wrong_count`, lastMode: sql`excluded.last_mode`,
      lastReviewedAt: sql`excluded.last_reviewed_at`, nextReviewAt: sql`excluded.next_review_at`, updatedAt: sql`excluded.updated_at`,
    },
  });

  return validOutcomes.length;
}
