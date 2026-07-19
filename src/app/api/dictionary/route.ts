import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { classMembers, vocabSets, wordBookmarks, words } from "@/db/schema";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const queryText = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 100);
  if (!queryText) return NextResponse.json({ results: [], query: "" });
  const pattern = `%${queryText}%`;

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

  const searchFilter = or(
    ilike(words.meaning, pattern),
    ilike(words.term, pattern),
    ilike(words.v1, pattern),
    ilike(words.v2, pattern),
    ilike(words.v3, pattern),
    ilike(words.ipa, pattern),
    ilike(vocabSets.name, pattern)
  );
  const rows = await db
    .select({
      id: words.id,
      setId: vocabSets.id,
      setName: vocabSets.name,
      setType: vocabSets.type,
      meaning: words.meaning,
      term: words.term,
      v1: words.v1,
      v2: words.v2,
      v3: words.v3,
      ipa: words.ipa,
      example: words.example,
      bookmarkId: wordBookmarks.id,
    })
    .from(words)
    .innerJoin(vocabSets, eq(vocabSets.id, words.setId))
    .leftJoin(wordBookmarks, and(eq(wordBookmarks.wordId, words.id), eq(wordBookmarks.userId, session.userId)))
    .where(classFilter ? and(classFilter, searchFilter) : searchFilter)
    .orderBy(
      sql`case when lower(coalesce(${words.term}, ${words.v1}, '')) = lower(${queryText}) then 0 else 1 end`,
      asc(vocabSets.name),
      asc(words.id)
    )
    .limit(50);

  return NextResponse.json({ results: rows, query: queryText });
}
