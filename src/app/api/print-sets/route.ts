import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { classMembers, vocabSets, words } from "@/db/schema";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const setIds = [...new Set((req.nextUrl.searchParams.get("setIds") || "").split(",").map(Number).filter(Number.isInteger))].slice(0, 5);
  if (setIds.length === 0) return NextResponse.json({ error: "Hãy chọn ít nhất một bộ từ." }, { status: 400 });

  let accessFilter;
  if (session.role !== "admin") {
    const memberships = await db.select({ classId: classMembers.classId }).from(classMembers).where(eq(classMembers.userId, session.userId));
    const classIds = memberships.map((item) => item.classId);
    accessFilter = classIds.length ? or(isNull(vocabSets.classId), inArray(vocabSets.classId, classIds)) : isNull(vocabSets.classId);
  }
  const conditions = [inArray(vocabSets.id, setIds)];
  if (accessFilter) conditions.push(accessFilter);

  const rows = await db
    .select({
      id: words.id,
      setId: words.setId,
      setName: vocabSets.name,
      setType: vocabSets.type,
      meaning: words.meaning,
      term: words.term,
      v1: words.v1,
      v2: words.v2,
      v3: words.v3,
      ipa: words.ipa,
      wtype: words.wtype,
      example: words.example,
    })
    .from(words)
    .innerJoin(vocabSets, eq(vocabSets.id, words.setId))
    .where(and(...conditions))
    .orderBy(vocabSets.id, words.id)
    .limit(500);

  const grouped = setIds.map((setId) => {
    const setWords = rows.filter((row) => row.setId === setId);
    return setWords.length > 0 ? { id: setId, name: setWords[0].setName, type: setWords[0].setType, words: setWords } : null;
  }).filter(Boolean);
  return NextResponse.json({ sets: grouped, totalWords: rows.length, truncated: rows.length === 500 });
}
