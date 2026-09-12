import { NextRequest, NextResponse } from "next/server";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { attempts, mistakes } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { recordDailyActivity } from "@/lib/activity";
import { recordSkillOutcomes, type SkillOutcomeInput } from "@/lib/skillProgress";
import { MISTAKE_REASON_FOR_SKILL, isWordSkill, skillForMode, type WordSkill } from "@/lib/wordSkills";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select()
    .from(attempts)
    .where(eq(attempts.userId, session.userId))
    .orderBy(desc(attempts.createdAt));
  return NextResponse.json({ results: rows });
}

const schema = z.object({
  setId: z.number().int().nullable(),
  setName: z.string().min(1),
  mode: z.enum([
    "fill", "mc", "match", "dictation", "pronunciation", "sentence", "mixed", "writing",
    "collocation", "cloze", "pattern",
  ]),
  score: z.number().int().min(0),
  total: z.number().int().min(0),
  durationSeconds: z.number().int().min(0).optional(),
  timed: z.boolean().optional(),
  wrongWordIds: z.array(z.number().int()).optional(),
  wrongWords: z.array(z.object({ wordId: z.number().int(), setId: z.number().int() })).optional(),
  practicedWordIds: z.array(z.number().int()).optional(),
  practicedWords: z.array(z.object({ wordId: z.number().int(), setId: z.number().int() })).optional(),
  wordsPracticed: z.number().int().min(1).max(10000).optional(),
  /** Per-dimension evidence. Falls back to the mode's default skill when omitted. */
  skillOutcomes: z.array(z.object({
    wordId: z.number().int(),
    skill: z.string().max(32),
    correct: z.boolean(),
    assisted: z.boolean().optional(),
  })).max(5000).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });

  const { wrongWordIds, wrongWords, practicedWordIds, practicedWords, wordsPracticed, skillOutcomes, ...attemptData } = parsed.data;

  const [row] = await db
    .insert(attempts)
    .values({ userId: session.userId, ...attemptData })
    .returning();

  const outcomes: SkillOutcomeInput[] = (skillOutcomes || []).filter((item) => isWordSkill(item.skill));
  const reasonByWordId = new Map<number, string>();
  for (const outcome of outcomes) {
    if (outcome.correct) continue;
    reasonByWordId.set(outcome.wordId, MISTAKE_REASON_FOR_SKILL[outcome.skill as WordSkill]);
  }

  const submittedMistakes = wrongWords || (parsed.data.setId !== null ? (wrongWordIds || []).map((wordId) => ({ wordId, setId: parsed.data.setId as number })) : []);
  const mistakesToSave = [...new Map(submittedMistakes.map((item) => [item.wordId, item])).values()];
  if (mistakesToSave.length > 0) {
    const lastWrongAt = new Date();
    await db.insert(mistakes).values(mistakesToSave.map((item) => ({
      userId: session.userId, wordId: item.wordId, setId: item.setId, timesWrong: 1, lastWrongAt,
      lastReason: reasonByWordId.get(item.wordId) ?? null,
    }))).onConflictDoUpdate({
      target: [mistakes.userId, mistakes.wordId],
      set: {
        timesWrong: sql`${mistakes.timesWrong} + 1`, setId: sql`excluded.set_id`, lastWrongAt,
        lastReason: sql`coalesce(excluded.last_reason, ${mistakes.lastReason})`,
      },
    });
  }

  const practiced = practicedWords || (parsed.data.setId !== null
    ? (practicedWordIds || []).map((wordId) => ({ wordId, setId: parsed.data.setId as number }))
    : []);
  if (practiced.length > 0) {
    const wrongIds = new Set(mistakesToSave.map((item) => item.wordId));
    const { recordWordOutcomes } = await import("@/lib/spacedProgress");
    await recordWordOutcomes(session.userId, practiced.map((item) => ({
      ...item,
      correct: !wrongIds.has(item.wordId),
    })), attemptData.mode);
  }

  // Skill mastery is behavioural evidence only: scheduling stays in wordProgress,
  // so one practiced word is still one reviewed word (no double scoring).
  const modeSkill = skillForMode(attemptData.mode);
  const effectiveOutcomes: SkillOutcomeInput[] = outcomes.length
    ? outcomes
    : modeSkill && practiced.length
      ? practiced.map((item) => ({
        wordId: item.wordId,
        skill: modeSkill,
        correct: !mistakesToSave.some((mistake) => mistake.wordId === item.wordId),
      }))
      : [];
  if (effectiveOutcomes.length) {
    await recordSkillOutcomes(session.userId, effectiveOutcomes, { mode: attemptData.mode });
  }

  await recordDailyActivity(session.userId, {
    wordsReviewed: wordsPracticed || 0,
    quizzesCompleted: 1,
  });

  return NextResponse.json({ result: row });
}
