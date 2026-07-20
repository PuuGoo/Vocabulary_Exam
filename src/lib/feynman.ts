const DAY_MS = 24 * 60 * 60 * 1000;

export function feynmanIntervalDays(confidence: number, previousReviews: number) {
  if (confidence <= 1) return 1;
  const intervals = confidence === 2 ? [3, 7, 14, 30] : [7, 14, 30, 60];
  return intervals[Math.min(Math.max(0, previousReviews), intervals.length - 1)];
}

export function nextFeynmanReview(confidence: number, previousReviews: number, now = new Date()) {
  return new Date(now.getTime() + feynmanIntervalDays(confidence, previousReviews) * DAY_MS);
}
