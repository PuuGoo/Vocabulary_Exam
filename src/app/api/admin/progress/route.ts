import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { attempts, classes, classMembers, mistakes, users, wordProgress } from "@/db/schema";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [students, memberships, attemptStats, progressStats, mistakeStats] = await Promise.all([
    db
      .select({ id: users.id, username: users.username, displayName: users.displayName })
      .from(users)
      .where(eq(users.role, "student"))
      .orderBy(users.displayName),
    db
      .select({ userId: classMembers.userId, className: classes.name })
      .from(classMembers)
      .innerJoin(classes, eq(classes.id, classMembers.classId)),
    db
      .select({
        userId: attempts.userId,
        attempts: sql<number>`count(${attempts.id})::int`,
        totalScore: sql<number>`coalesce(sum(${attempts.score}), 0)::int`,
        totalQuestions: sql<number>`coalesce(sum(${attempts.total}), 0)::int`,
        lastActivityAt: sql<Date | null>`max(${attempts.createdAt})`,
      })
      .from(attempts)
      .groupBy(attempts.userId),
    db
      .select({
        userId: wordProgress.userId,
        reviewed: sql<number>`count(${wordProgress.id})::int`,
        known: sql<number>`count(${wordProgress.id}) filter (where ${wordProgress.known} = true)::int`,
        lastProgressAt: sql<Date | null>`max(${wordProgress.updatedAt})`,
      })
      .from(wordProgress)
      .groupBy(wordProgress.userId),
    db
      .select({ userId: mistakes.userId, count: sql<number>`count(${mistakes.id})::int` })
      .from(mistakes)
      .groupBy(mistakes.userId),
  ]);

  const classMap = new Map<number, string[]>();
  for (const row of memberships) {
    classMap.set(row.userId, [...(classMap.get(row.userId) || []), row.className]);
  }
  const attemptMap = new Map(attemptStats.map((row) => [row.userId, row]));
  const progressMap = new Map(progressStats.map((row) => [row.userId, row]));
  const mistakeMap = new Map(mistakeStats.map((row) => [row.userId, row.count]));

  const result = students.map((student) => {
    const quiz = attemptMap.get(student.id);
    const progress = progressMap.get(student.id);
    const activityDates = [quiz?.lastActivityAt, progress?.lastProgressAt].filter(Boolean) as Date[];
    return {
      ...student,
      classes: classMap.get(student.id) || [],
      attempts: quiz?.attempts || 0,
      accuracy: quiz && quiz.totalQuestions > 0
        ? Math.round((quiz.totalScore / quiz.totalQuestions) * 100)
        : null,
      reviewed: progress?.reviewed || 0,
      known: progress?.known || 0,
      needsReview: mistakeMap.get(student.id) || 0,
      lastActivityAt: activityDates.length > 0
        ? new Date(Math.max(...activityDates.map((date) => new Date(date).getTime())))
        : null,
    };
  });

  return NextResponse.json({ students: result });
}
