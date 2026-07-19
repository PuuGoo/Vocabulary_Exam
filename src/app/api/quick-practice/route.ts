import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { classMembers, mistakes, vocabSets, wordProgress, words } from "@/db/schema";
import { getSession } from "@/lib/auth";

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
      meaning: words.meaning,
      v1: words.v1,
      v2: words.v2,
      v3: words.v3,
      term: words.term,
      example: words.example,
      wtype: words.wtype,
      ipa: words.ipa,
      setName: vocabSets.name,
      setType: vocabSets.type,
      mistakeId: mistakes.id,
      timesWrong: mistakes.timesWrong,
      known: wordProgress.known,
    })
    .from(words)
    .innerJoin(vocabSets, eq(vocabSets.id, words.setId))
    .leftJoin(mistakes, and(eq(mistakes.wordId, words.id), eq(mistakes.userId, session.userId)))
    .leftJoin(wordProgress, and(eq(wordProgress.wordId, words.id), eq(wordProgress.userId, session.userId)));

  const candidates = classFilter ? await query.where(classFilter) : await query;
  if (candidates.length === 0) {
    return NextResponse.json({ error: "Chưa có từ phù hợp để luyện nhanh." }, { status: 404 });
  }

  const priority = (item: (typeof candidates)[number]) =>
    (item.timesWrong || 0) * 100 + (item.known === false ? 50 : item.known === null ? 20 : 0);

  const bySet = new Map<number, typeof candidates>();
  for (const item of candidates) {
    const group = bySet.get(item.setId) || [];
    group.push(item);
    bySet.set(item.setId, group);
  }

  const rankedSets = [...bySet.values()].map((items) => {
    const selected = items
      .map((item) => ({ item, random: Math.random() }))
      .sort((a, b) => priority(b.item) - priority(a.item) || a.random - b.random)
      .slice(0, count)
      .map(({ item }) => item);
    return {
      selected,
      score: selected.reduce((sum, item) => sum + priority(item), 0) + Math.min(items.length, count),
    };
  });
  rankedSets.sort((a, b) => b.score - a.score || b.selected.length - a.selected.length);

  const selected = rankedSets[0].selected;
  const first = selected[0];
  const selectedWords = selected.map(({ setName: _setName, setType: _setType, mistakeId: _mistakeId, timesWrong: _timesWrong, known: _known, ...word }) => word);
  const mistakeIdByWordId = Object.fromEntries(
    selected.filter((item) => item.mistakeId !== null).map((item) => [item.id, item.mistakeId])
  );
  const reviewCount = selected.filter((item) => item.timesWrong || item.known === false).length;
  const newCount = selected.filter((item) => item.known === null && !item.timesWrong).length;

  return NextResponse.json({
    set: { id: first.setId, name: first.setName, type: first.setType, words: selectedWords },
    recommendation: { reviewCount, newCount },
    mistakeIdByWordId,
  });
}
