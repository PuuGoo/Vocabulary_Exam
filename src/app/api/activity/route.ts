import { NextResponse } from "next/server";
import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { attempts, dailyActivities, wordProgress } from "@/db/schema";
import { dateInVietnam } from "@/lib/activity";
import { getSession } from "@/lib/auth";

function shiftDay(value: string, amount: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = dateInVietnam();
  const firstDay = shiftDay(today, -29);
  const cutoff = new Date(`${firstDay}T00:00:00Z`);
  const [savedRows, legacyProgress, legacyAttempts] = await Promise.all([
    db.select().from(dailyActivities).where(and(
      eq(dailyActivities.userId, session.userId),
      gte(dailyActivities.activityDate, firstDay)
    )),
    db.select({ at: wordProgress.updatedAt }).from(wordProgress).where(and(
      eq(wordProgress.userId, session.userId),
      gte(wordProgress.updatedAt, cutoff)
    )),
    db.select({ at: attempts.createdAt }).from(attempts).where(and(
      eq(attempts.userId, session.userId),
      gte(attempts.createdAt, cutoff)
    )),
  ]);

  const savedByDay = new Map(savedRows.map((row) => [row.activityDate, row]));
  const legacyWords = new Map<string, number>();
  const legacyQuizzes = new Map<string, number>();
  legacyProgress.forEach((row) => {
    const day = dateInVietnam(row.at);
    legacyWords.set(day, (legacyWords.get(day) || 0) + 1);
  });
  legacyAttempts.forEach((row) => {
    const day = dateInVietnam(row.at);
    legacyQuizzes.set(day, (legacyQuizzes.get(day) || 0) + 1);
  });

  const days = Array.from({ length: 30 }, (_, index) => {
    const date = shiftDay(firstDay, index);
    const saved = savedByDay.get(date);
    const wordsReviewed = Math.max(saved?.wordsReviewed || 0, legacyWords.get(date) || 0);
    const quizzesCompleted = Math.max(saved?.quizzesCompleted || 0, legacyQuizzes.get(date) || 0);
    const score = wordsReviewed + quizzesCompleted * 3;
    return {
      date,
      wordsReviewed,
      quizzesCompleted,
      level: score === 0 ? 0 : score < 5 ? 1 : score < 10 ? 2 : 3,
    };
  });
  const last7Days = days.slice(-7);

  return NextResponse.json({
    days,
    summary: {
      activeDays: days.filter((day) => day.level > 0).length,
      weekWords: last7Days.reduce((sum, day) => sum + day.wordsReviewed, 0),
      weekQuizzes: last7Days.reduce((sum, day) => sum + day.quizzesCompleted, 0),
    },
  });
}
