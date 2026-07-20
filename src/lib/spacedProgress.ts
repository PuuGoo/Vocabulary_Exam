import { and, eq, inArray } from "drizzle-orm";
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

  for (const outcome of validOutcomes) {
    const next = nextSpacedProgress(previousByWord.get(outcome.wordId), outcome.correct, reviewedAt);
    await db.insert(wordProgress).values({
      userId,
      wordId: outcome.wordId,
      ...next,
      lastMode: mode,
    }).onConflictDoUpdate({
      target: [wordProgress.userId, wordProgress.wordId],
      set: { ...next, lastMode: mode },
    });
  }

  return validOutcomes.length;
}
