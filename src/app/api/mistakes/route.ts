import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
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
