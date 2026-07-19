import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { attempts, dailyActivities, learningGoals, wordProgress } from "@/db/schema";
import { getSession } from "@/lib/auth";

const TIME_ZONE = "Asia/Ho_Chi_Minh";
const DEFAULT_DAILY_WORDS = 10;

function dateInVietnam(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function previousDay(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

async function getGoalSummary(userId: number) {
  const today = dateInVietnam();
  const [goal, todayActivity, todayProgress, activityRows, progressDays, attemptDays] = await Promise.all([
    db.query.learningGoals.findFirst({ where: eq(learningGoals.userId, userId) }),
    db.query.dailyActivities.findFirst({ where: and(
      eq(dailyActivities.userId, userId),
      eq(dailyActivities.activityDate, today)
    ) }),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(wordProgress)
      .where(and(
        eq(wordProgress.userId, userId),
        sql`(${wordProgress.updatedAt} at time zone ${TIME_ZONE})::date = (now() at time zone ${TIME_ZONE})::date`
      )),
    db
      .select({ day: dailyActivities.activityDate })
      .from(dailyActivities)
      .where(and(
        eq(dailyActivities.userId, userId),
        sql`${dailyActivities.activityDate} >= (now() at time zone ${TIME_ZONE})::date - 366`
      )),
    db
      .select({ at: wordProgress.updatedAt })
      .from(wordProgress)
      .where(and(
        eq(wordProgress.userId, userId),
        sql`${wordProgress.updatedAt} >= now() - interval '366 days'`
      )),
    db
      .select({ at: attempts.createdAt })
      .from(attempts)
      .where(and(
        eq(attempts.userId, userId),
        sql`${attempts.createdAt} >= now() - interval '366 days'`
      )),
  ]);

  const activityDays = new Set([
    ...activityRows.map((row) => row.day),
    ...progressDays.map((row) => dateInVietnam(row.at)),
    ...attemptDays.map((row) => dateInVietnam(row.at)),
  ]);
  let cursor = activityDays.has(today) ? today : previousDay(today);
  let streak = 0;
  while (activityDays.has(cursor)) {
    streak += 1;
    cursor = previousDay(cursor);
  }

  const dailyWords = goal?.dailyWords || DEFAULT_DAILY_WORDS;
  const todayWords = Math.max(todayActivity?.wordsReviewed || 0, todayProgress[0]?.count || 0);
  return { dailyWords, todayWords, streak, completed: todayWords >= dailyWords };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getGoalSummary(session.userId));
}

const goalSchema = z.object({ dailyWords: z.number().int().min(1).max(200) });

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = goalSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Mục tiêu phải từ 1 đến 200 từ mỗi ngày." }, { status: 400 });
  }

  await db
    .insert(learningGoals)
    .values({ userId: session.userId, dailyWords: parsed.data.dailyWords })
    .onConflictDoUpdate({
      target: learningGoals.userId,
      set: { dailyWords: parsed.data.dailyWords, updatedAt: new Date() },
    });
  return NextResponse.json(await getGoalSummary(session.userId));
}
