import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { userWordSkillEvents, userWordSkillProgress, words } from "@/db/schema";
import { applySkillOutcome, summarizeSkillProgress } from "@/lib/skillMastery";
import type { LearningSkill, SkillResult } from "@/lib/learningSkills";

export type RecordSkillOutcomeInput = {
  wordId: number;
  skill: LearningSkill;
  result: SkillResult;
  sourceMode: string;
  eventKey: string;
};

export async function recordSkillOutcome(userId: number, input: RecordSkillOutcomeInput, practicedAt = new Date()) {
  return db.transaction(async (tx) => {
    const [word] = await tx.select({ id: words.id }).from(words).where(eq(words.id, input.wordId)).limit(1);
    if (!word) throw new Error("WORD_NOT_FOUND");
    const [previous] = await tx.select().from(userWordSkillProgress).where(and(
      eq(userWordSkillProgress.userId, userId), eq(userWordSkillProgress.wordId, input.wordId), eq(userWordSkillProgress.skill, input.skill),
    )).limit(1);
    const next = applySkillOutcome(previous || null, input.result);
    const [event] = await tx.insert(userWordSkillEvents).values({
      userId, wordId: input.wordId, eventKey: input.eventKey, skill: input.skill,
      resultQuality: next.quality, sourceMode: input.sourceMode, createdAt: practicedAt,
    }).onConflictDoNothing({ target: [userWordSkillEvents.userId, userWordSkillEvents.eventKey] }).returning({ id: userWordSkillEvents.id });
    if (!event) return { duplicate: true, progress: previous || null };
    const [progress] = await tx.insert(userWordSkillProgress).values({
      userId, wordId: input.wordId, skill: input.skill, masteryScore: next.masteryScore,
      practiceCount: 1, successCount: next.successDelta, failureCount: next.failureDelta,
      lastResult: input.result, lastPracticedAt: practicedAt, updatedAt: practicedAt,
    }).onConflictDoUpdate({
      target: [userWordSkillProgress.userId, userWordSkillProgress.wordId, userWordSkillProgress.skill],
      set: {
        // Compute from the value currently locked by PostgreSQL's UPSERT so
        // two distinct outcomes arriving together cannot overwrite each other
        // with scores derived from the same stale snapshot.
        masteryScore: sql`least(100, greatest(0, round(${userWordSkillProgress.masteryScore} * 0.8 + ${next.quality} * 0.2)))::int`,
        practiceCount: sql`${userWordSkillProgress.practiceCount} + 1`,
        successCount: sql`${userWordSkillProgress.successCount} + ${next.successDelta}`,
        failureCount: sql`${userWordSkillProgress.failureCount} + ${next.failureDelta}`,
        lastResult: input.result, lastPracticedAt: practicedAt, updatedAt: practicedAt,
      },
    }).returning();
    return { duplicate: false, progress };
  });
}

export async function getSkillProgressForWords(userId: number, wordIds: number[]) {
  if (!wordIds.length) return [];
  return db.select().from(userWordSkillProgress).where(and(
    eq(userWordSkillProgress.userId, userId), inArray(userWordSkillProgress.wordId, wordIds),
  ));
}

export function buildSetMasterySummary(rows: Array<{ wordId: number; skill: string; masteryScore: number; practiceCount: number }>) {
  const bySkill = new Map<string, { total: number; count: number; evidence: number }>();
  for (const row of rows) {
    const value = bySkill.get(row.skill) || { total: 0, count: 0, evidence: 0 };
    value.total += row.masteryScore; value.count++; value.evidence += row.practiceCount;
    bySkill.set(row.skill, value);
  }
  const skillRows = [...bySkill].map(([skill, value]) => ({ skill: skill as LearningSkill, masteryScore: Math.round(value.total / value.count), practiceCount: value.evidence }));
  const overall = skillRows.length ? Math.round(skillRows.reduce((sum, row) => sum + row.masteryScore, 0) / skillRows.length) : null;
  return { overall, skills: summarizeSkillProgress(skillRows) };
}
