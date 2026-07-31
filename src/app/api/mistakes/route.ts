import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { mistakes, wordProgress, words, vocabSets } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { recordDailyActivity } from "@/lib/activity";
import { recordWordOutcomes } from "@/lib/spacedProgress";
import { signFlashcardUndo, verifyFlashcardUndo } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select({
      id: mistakes.id,
      timesWrong: mistakes.timesWrong,
      lastWrongAt: mistakes.lastWrongAt,
      wordId: words.id,
      meaning: words.meaning,
      term: words.term,
      v1: words.v1,
      v2: words.v2,
      v3: words.v3,
      ipa: words.ipa,
      setId: vocabSets.id,
      setName: vocabSets.name,
      setType: vocabSets.type,
    })
    .from(mistakes)
    .innerJoin(words, eq(mistakes.wordId, words.id))
    .innerJoin(vocabSets, eq(mistakes.setId, vocabSets.id))
    .where(eq(mistakes.userId, session.userId))
    .orderBy(desc(mistakes.timesWrong), desc(mistakes.lastWrongAt));

  return NextResponse.json({ mistakes: rows });
}

const markSchema = z.object({
  wordId: z.number().int(),
  setId: z.number().int(),
  learned: z.boolean(),
});

/** Used by Flashcard "Học bài" mode to mark a single card as known/unknown while browsing. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = markSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });

  const [previousMistake] = await db.select().from(mistakes).where(and(
    eq(mistakes.userId, session.userId),
    eq(mistakes.wordId, parsed.data.wordId),
  )).limit(1);
  const [previousProgress] = await db.select().from(wordProgress).where(and(
    eq(wordProgress.userId, session.userId),
    eq(wordProgress.wordId, parsed.data.wordId),
  )).limit(1);

  if (parsed.data.learned) {
    await db.delete(mistakes).where(and(eq(mistakes.userId, session.userId), eq(mistakes.wordId, parsed.data.wordId)));
  } else {
    await db
      .insert(mistakes)
      .values({ userId: session.userId, wordId: parsed.data.wordId, setId: parsed.data.setId, timesWrong: 1, lastWrongAt: new Date() })
      .onConflictDoUpdate({
        target: [mistakes.userId, mistakes.wordId],
        set: { timesWrong: sql`${mistakes.timesWrong} + 1`, lastWrongAt: new Date() },
      });
  }

  await recordWordOutcomes(session.userId, [{
    wordId: parsed.data.wordId,
    setId: parsed.data.setId,
    correct: parsed.data.learned,
  }], "flashcard");

  await recordDailyActivity(session.userId, { wordsReviewed: 1 });

  const undoToken = await signFlashcardUndo({
    userId: session.userId,
    wordId: parsed.data.wordId,
    setId: parsed.data.setId,
    mistake: previousMistake ? {
      setId: previousMistake.setId,
      timesWrong: previousMistake.timesWrong,
      lastWrongAt: previousMistake.lastWrongAt.toISOString(),
    } : null,
    progress: previousProgress ? {
      known: previousProgress.known,
      intervalDays: previousProgress.intervalDays,
      reviewStreak: previousProgress.reviewStreak,
      correctCount: previousProgress.correctCount,
      wrongCount: previousProgress.wrongCount,
      lastMode: previousProgress.lastMode,
      lastReviewedAt: previousProgress.lastReviewedAt?.toISOString() ?? null,
      nextReviewAt: previousProgress.nextReviewAt?.toISOString() ?? null,
      updatedAt: previousProgress.updatedAt.toISOString(),
    } : null,
  });

  return NextResponse.json({ ok: true, undoToken });
}

const undoSchema = z.object({ undoToken: z.string().min(1) });

/** Restore the exact learning state captured immediately before a rating. */
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = undoSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Mã hoàn tác không hợp lệ." }, { status: 400 });

  const snapshot = await verifyFlashcardUndo(parsed.data.undoToken);
  if (!snapshot || snapshot.userId !== session.userId) {
    return NextResponse.json({ error: "Hoàn tác đã hết hạn." }, { status: 410 });
  }

  await db.transaction(async (tx) => {
    if (snapshot.mistake) {
      await tx.insert(mistakes).values({
        userId: session.userId,
        wordId: snapshot.wordId,
        setId: snapshot.mistake.setId,
        timesWrong: snapshot.mistake.timesWrong,
        lastWrongAt: new Date(snapshot.mistake.lastWrongAt),
      }).onConflictDoUpdate({
        target: [mistakes.userId, mistakes.wordId],
        set: {
          setId: snapshot.mistake!.setId,
          timesWrong: snapshot.mistake!.timesWrong,
          lastWrongAt: new Date(snapshot.mistake!.lastWrongAt),
        },
      });
    } else {
      await tx.delete(mistakes).where(and(
        eq(mistakes.userId, session.userId),
        eq(mistakes.wordId, snapshot.wordId),
      ));
    }

    if (snapshot.progress) {
      const p = snapshot.progress;
      await tx.insert(wordProgress).values({
        userId: session.userId,
        wordId: snapshot.wordId,
        known: p.known,
        intervalDays: p.intervalDays,
        reviewStreak: p.reviewStreak,
        correctCount: p.correctCount,
        wrongCount: p.wrongCount,
        lastMode: p.lastMode,
        lastReviewedAt: p.lastReviewedAt ? new Date(p.lastReviewedAt) : null,
        nextReviewAt: p.nextReviewAt ? new Date(p.nextReviewAt) : null,
        updatedAt: new Date(p.updatedAt),
      }).onConflictDoUpdate({
        target: [wordProgress.userId, wordProgress.wordId],
        set: {
          known: p.known,
          intervalDays: p.intervalDays,
          reviewStreak: p.reviewStreak,
          correctCount: p.correctCount,
          wrongCount: p.wrongCount,
          lastMode: p.lastMode,
          lastReviewedAt: p.lastReviewedAt ? new Date(p.lastReviewedAt) : null,
          nextReviewAt: p.nextReviewAt ? new Date(p.nextReviewAt) : null,
          updatedAt: new Date(p.updatedAt),
        },
      });
    } else {
      await tx.delete(wordProgress).where(and(
        eq(wordProgress.userId, session.userId),
        eq(wordProgress.wordId, snapshot.wordId),
      ));
    }
  });

  return NextResponse.json({ ok: true });
}
