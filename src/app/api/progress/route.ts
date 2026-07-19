import { NextResponse } from "next/server";
import { eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { attempts, classMembers, mistakes, vocabSets, wordProgress, words } from "@/db/schema";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let classFilter;
  if (session.role !== "admin") {
    const memberships = await db
      .select({ classId: classMembers.classId })
      .from(classMembers)
      .where(eq(classMembers.userId, session.userId));
    const classIds = memberships.map((item) => item.classId);
    classFilter = classIds.length > 0
      ? or(isNull(vocabSets.classId), inArray(vocabSets.classId, classIds))
      : isNull(vocabSets.classId);
  }

  const setsQuery = db
    .select({
      id: vocabSets.id,
      name: vocabSets.name,
      type: vocabSets.type,
      totalWords: sql<number>`count(distinct ${words.id})::int`,
    })
    .from(vocabSets)
    .leftJoin(words, eq(words.setId, vocabSets.id))
    .groupBy(vocabSets.id)
    .orderBy(vocabSets.createdAt);

  const [sets, progress, attemptStats, mistakeStats] = await Promise.all([
    classFilter ? setsQuery.where(classFilter) : setsQuery,
    db
      .select({
        setId: words.setId,
        reviewed: sql<number>`count(${wordProgress.id})::int`,
        known: sql<number>`count(${wordProgress.id}) filter (where ${wordProgress.known} = true)::int`,
      })
      .from(wordProgress)
      .innerJoin(words, eq(words.id, wordProgress.wordId))
      .where(eq(wordProgress.userId, session.userId))
      .groupBy(words.setId),
    db
      .select({
        setId: attempts.setId,
        attempts: sql<number>`count(${attempts.id})::int`,
        totalScore: sql<number>`coalesce(sum(${attempts.score}), 0)::int`,
        totalQuestions: sql<number>`coalesce(sum(${attempts.total}), 0)::int`,
        lastAttemptAt: sql<Date | null>`max(${attempts.createdAt})`,
      })
      .from(attempts)
      .where(eq(attempts.userId, session.userId))
      .groupBy(attempts.setId),
    db
      .select({ setId: mistakes.setId, count: sql<number>`count(${mistakes.id})::int` })
      .from(mistakes)
      .where(eq(mistakes.userId, session.userId))
      .groupBy(mistakes.setId),
  ]);

  const progressMap = new Map(progress.map((row) => [row.setId, row]));
  const attemptMap = new Map(attemptStats.map((row) => [row.setId, row]));
  const mistakeMap = new Map(mistakeStats.map((row) => [row.setId, row.count]));

  const result = sets.map((set) => {
    const wordStats = progressMap.get(set.id);
    const quizStats = attemptMap.get(set.id);
    return {
      ...set,
      reviewed: wordStats?.reviewed || 0,
      known: wordStats?.known || 0,
      needsReview: mistakeMap.get(set.id) || 0,
      attempts: quizStats?.attempts || 0,
      accuracy: quizStats && quizStats.totalQuestions > 0
        ? Math.round((quizStats.totalScore / quizStats.totalQuestions) * 100)
        : null,
      lastAttemptAt: quizStats?.lastAttemptAt || null,
    };
  });

  return NextResponse.json({ sets: result });
}
