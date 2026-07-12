import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { mistakes, words, vocabSets } from "@/db/schema";
import { getSession } from "@/lib/auth";

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

  return NextResponse.json({ ok: true });
}
