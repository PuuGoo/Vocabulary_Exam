export const REVIEW_INTERVALS = [1, 3, 7, 14, 30, 60] as const;

export type SpacedProgress = {
  reviewStreak: number;
  correctCount: number;
  wrongCount: number;
};

export function nextSpacedProgress(
  previous: Partial<SpacedProgress> | null | undefined,
  correct: boolean,
  reviewedAt = new Date()
) {
  const oldStreak = Math.max(0, previous?.reviewStreak || 0);
  const reviewStreak = correct ? oldStreak + 1 : 0;
  const intervalDays = correct
    ? REVIEW_INTERVALS[Math.min(reviewStreak - 1, REVIEW_INTERVALS.length - 1)]
    : REVIEW_INTERVALS[0];
  const nextReviewAt = new Date(reviewedAt.getTime() + intervalDays * 24 * 60 * 60 * 1000);

  return {
    known: correct,
    intervalDays,
    reviewStreak,
    correctCount: (previous?.correctCount || 0) + (correct ? 1 : 0),
    wrongCount: (previous?.wrongCount || 0) + (correct ? 0 : 1),
    lastReviewedAt: reviewedAt,
    nextReviewAt,
    updatedAt: reviewedAt,
  };
}
