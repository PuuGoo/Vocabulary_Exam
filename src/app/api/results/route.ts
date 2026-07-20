import { NextRequest, NextResponse } from "next/server";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { attempts, mistakes } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { recordDailyActivity } from "@/lib/activity";

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
  mode: z.enum(["fill", "mc", "match", "dictation", "pronunciation", "sentence", "mixed"]),
  score: z.number().int().min(0),
  total: z.number().int().min(0),
  durationSeconds: z.number().int().min(0).optional(),
  timed: z.boolean().optional(),
  wrongWordIds: z.array(z.number().int()).optional(),
  wrongWords: z.array(z.object({ wordId: z.number().int(), setId: z.number().int() })).optional(),
  practicedWordIds: z.array(z.number().int()).optional(),
  practicedWords: z.array(z.object({ wordId: z.number().int(), setId: z.number().int() })).optional(),
  wordsPracticed: z.number().int().min(1).max(10000).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });

  const { wrongWordIds, wrongWords, practicedWordIds, practicedWords, wordsPracticed, ...attemptData } = parsed.data;

  const [row] = await db
    .insert(attempts)
    .values({ userId: session.userId, ...attemptData })
    .returning();

  const mistakesToSave = wrongWords || (parsed.data.setId !== null ? (wrongWordIds || []).map((wordId) => ({ wordId, setId: parsed.data.setId as number })) : []);
  if (mistakesToSave.length > 0) {
    for (const item of mistakesToSave) {
      await db
        .insert(mistakes)
        .values({ userId: session.userId, wordId: item.wordId, setId: item.setId, timesWrong: 1, lastWrongAt: new Date() })
        .onConflictDoUpdate({
          target: [mistakes.userId, mistakes.wordId],
          set: { timesWrong: sql`${mistakes.timesWrong} + 1`, lastWrongAt: new Date() },
        });
    }
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

  await recordDailyActivity(session.userId, {
    wordsReviewed: wordsPracticed || 0,
    quizzesCompleted: 1,
  });

  return NextResponse.json({ result: row });
}
