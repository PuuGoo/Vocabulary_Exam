import { sql } from "drizzle-orm";
import { db } from "@/db";
import { dailyActivities } from "@/db/schema";

const TIME_ZONE = "Asia/Ho_Chi_Minh";

export function dateInVietnam(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export async function recordDailyActivity(
  userId: number,
  change: { wordsReviewed?: number; quizzesCompleted?: number }
) {
  const wordsReviewed = Math.max(0, change.wordsReviewed || 0);
  const quizzesCompleted = Math.max(0, change.quizzesCompleted || 0);
  if (wordsReviewed === 0 && quizzesCompleted === 0) return;

  await db
    .insert(dailyActivities)
    .values({ userId, activityDate: dateInVietnam(), wordsReviewed, quizzesCompleted })
    .onConflictDoUpdate({
      target: [dailyActivities.userId, dailyActivities.activityDate],
      set: {
        wordsReviewed: sql`${dailyActivities.wordsReviewed} + ${wordsReviewed}`,
        quizzesCompleted: sql`${dailyActivities.quizzesCompleted} + ${quizzesCompleted}`,
        updatedAt: new Date(),
      },
    });
}
