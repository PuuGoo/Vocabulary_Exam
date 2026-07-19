import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { classMembers, vocabSets, words } from "@/db/schema";
import { getSession } from "@/lib/auth";

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const setIds = [...new Set((req.nextUrl.searchParams.get("setIds") || "").split(",").map(Number).filter(Number.isInteger))].slice(0, 30);
  const requestedCount = Number(req.nextUrl.searchParams.get("count"));
  const count = [10, 20, 50].includes(requestedCount) ? requestedCount : 20;
  if (setIds.length === 0) return NextResponse.json({ error: "Hãy chọn ít nhất một bộ từ." }, { status: 400 });

  let accessFilter;
  if (session.role !== "admin") {
    const memberships = await db.select({ classId: classMembers.classId }).from(classMembers).where(eq(classMembers.userId, session.userId));
    const classIds = memberships.map((item) => item.classId);
    accessFilter = classIds.length ? or(isNull(vocabSets.classId), inArray(vocabSets.classId, classIds)) : isNull(vocabSets.classId);
  }

  const conditions = [inArray(vocabSets.id, setIds), eq(vocabSets.type, "ielts_vocab")];
  if (accessFilter) conditions.push(accessFilter);
  const candidates = await db
    .select({
      id: words.id,
      setId: words.setId,
      setName: vocabSets.name,
      meaning: words.meaning,
      term: words.term,
      ipa: words.ipa,
      example: words.example,
      wtype: words.wtype,
    })
    .from(words)
    .innerJoin(vocabSets, eq(vocabSets.id, words.setId))
    .where(and(...conditions));

  const eligible = candidates.filter((word) => Boolean(word.term?.trim()));
  return NextResponse.json({ words: shuffle(eligible).slice(0, count), available: eligible.length });
}
