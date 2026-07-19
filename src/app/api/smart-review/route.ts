import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { classMembers, mistakes, vocabSets, wordProgress, words } from "@/db/schema";
import { getSession } from "@/lib/auth";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requestedCount = Number(req.nextUrl.searchParams.get("count"));
  const count = [5, 10, 20].includes(requestedCount) ? requestedCount : 10;

  let classFilter;
  if (session.role !== "admin") {
    const memberships = await db
      .select({ classId: classMembers.classId })
      .from(classMembers)
      .where(eq(classMembers.userId, session.userId));
    const classIds = memberships.map((item) => item.classId);
    classFilter = classIds.length
      ? or(isNull(vocabSets.classId), inArray(vocabSets.classId, classIds))
      : isNull(vocabSets.classId);
  }

  const query = db
    .select({
      id: words.id,
      setId: words.setId,
      setName: vocabSets.name,
      setType: vocabSets.type,
      meaning: words.meaning,
      v1: words.v1,
      v2: words.v2,
      v3: words.v3,
      term: words.term,
      example: words.example,
      wtype: words.wtype,
      ipa: words.ipa,
      known: wordProgress.known,
      reviewedAt: wordProgress.updatedAt,
      timesWrong: mistakes.timesWrong,
    })
    .from(words)
    .innerJoin(vocabSets, eq(vocabSets.id, words.setId))
    .leftJoin(wordProgress, and(eq(wordProgress.wordId, words.id), eq(wordProgress.userId, session.userId)))
    .leftJoin(mistakes, and(eq(mistakes.wordId, words.id), eq(mistakes.userId, session.userId)));

  const candidates = classFilter ? await query.where(classFilter) : await query;
  if (candidates.length === 0) {
    return NextResponse.json({ words: [], summary: { total: 0, difficult: 0, forgotten: 0, stale: 0, new: 0 } });
  }

  const now = Date.now();
  const ranked = candidates.map((word) => {
    const ageDays = word.reviewedAt ? Math.max(0, Math.floor((now - word.reviewedAt.getTime()) / DAY_MS)) : null;
    let reason: "difficult" | "forgotten" | "stale" | "new";
    let priority: number;
    if ((word.timesWrong || 0) > 0) {
      reason = "difficult";
      priority = 400 + (word.timesWrong || 0) * 20 + (ageDays || 0);
    } else if (word.known === false) {
      reason = "forgotten";
      priority = 300 + (ageDays || 0);
    } else if (word.known === true) {
      reason = "stale";
      priority = 100 + (ageDays || 0);
    } else {
      reason = "new";
      priority = 50;
    }
    return { ...word, ageDays, reason, priority, random: Math.random() };
  }).filter((word) => word.known !== true || (word.ageDays || 0) >= 7 || (word.timesWrong || 0) > 0);

  ranked.sort((a, b) => b.priority - a.priority || a.random - b.random);
  const selected = ranked.slice(0, count).map(({ priority: _priority, random: _random, ...word }) => word);
  const summary = selected.reduce(
    (result, word) => ({ ...result, [word.reason]: result[word.reason] + 1 }),
    { total: selected.length, difficult: 0, forgotten: 0, stale: 0, new: 0 }
  );

  return NextResponse.json({ words: selected, summary });
}
