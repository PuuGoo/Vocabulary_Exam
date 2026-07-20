import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { classMembers, teachBackNotes, vocabSets, words } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { nextFeynmanReview } from "@/lib/feynman";
import { recordWordOutcomes } from "@/lib/spacedProgress";

async function accessibleSetIds(userId: number, role: string) {
  if (role === "admin") return null;
  const memberships = await db.select({ classId: classMembers.classId }).from(classMembers).where(eq(classMembers.userId, userId));
  return memberships.map((item) => item.classId);
}

function accessFilter(classIds: number[] | null) {
  if (classIds === null) return undefined;
  return classIds.length ? or(isNull(vocabSets.classId), inArray(vocabSets.classId, classIds)) : isNull(vocabSets.classId);
}

const wordFields = {
  id: words.id, setId: words.setId, setName: vocabSets.name, setType: vocabSets.type,
  meaning: words.meaning, term: words.term, v1: words.v1, v2: words.v2, v3: words.v3,
  example: words.example, wtype: words.wtype, ipa: words.ipa,
};

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const classIds = await accessibleSetIds(session.userId, session.role);
  const allowed = accessFilter(classIds);
  const setId = Number(req.nextUrl.searchParams.get("setId"));
  if (Number.isInteger(setId) && setId > 0) {
    const rows = await db.select({ ...wordFields, confidence: teachBackNotes.confidence, reviewCount: teachBackNotes.reviewCount, nextReviewAt: teachBackNotes.nextReviewAt })
      .from(words).innerJoin(vocabSets, eq(vocabSets.id, words.setId))
      .leftJoin(teachBackNotes, and(eq(teachBackNotes.wordId, words.id), eq(teachBackNotes.userId, session.userId)))
      .where(and(eq(words.setId, setId), allowed));
    if (!rows.length) return NextResponse.json({ error: "Bộ từ không tồn tại hoặc bạn không có quyền truy cập." }, { status: 404 });
    return NextResponse.json({ words: rows });
  }
  const due = await db.select({ ...wordFields, confidence: teachBackNotes.confidence, reviewCount: teachBackNotes.reviewCount, nextReviewAt: teachBackNotes.nextReviewAt })
    .from(teachBackNotes).innerJoin(words, eq(words.id, teachBackNotes.wordId)).innerJoin(vocabSets, eq(vocabSets.id, words.setId))
    .where(and(eq(teachBackNotes.userId, session.userId), lte(teachBackNotes.nextReviewAt, new Date()), allowed))
    .orderBy(teachBackNotes.nextReviewAt).limit(30);
  return NextResponse.json({ words: due, dueCount: due.length });
}

const schema = z.object({
  wordId: z.number().int().positive(),
  simpleExplanation: z.string().trim().min(10).max(2000),
  ownExample: z.string().trim().max(1000).optional().default(""),
  confidence: z.number().int().min(1).max(3),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ." }, { status: 400 });
  const classIds = await accessibleSetIds(session.userId, session.role);
  const allowed = accessFilter(classIds);
  const [word] = await db.select({ id: words.id }).from(words).innerJoin(vocabSets, eq(vocabSets.id, words.setId)).where(and(eq(words.id, parsed.data.wordId), allowed));
  if (!word) return NextResponse.json({ error: "Bạn không có quyền học từ này." }, { status: 403 });
  const existing = await db.query.teachBackNotes.findFirst({ where: and(eq(teachBackNotes.userId, session.userId), eq(teachBackNotes.wordId, word.id)) });
  const nextReviewAt = nextFeynmanReview(parsed.data.confidence, existing?.reviewCount || 0);
  const reviewCount = (existing?.reviewCount || 0) + 1;
  const [note] = await db.insert(teachBackNotes).values({ userId: session.userId, wordId: word.id, simpleExplanation: parsed.data.simpleExplanation, ownExample: parsed.data.ownExample || null, confidence: parsed.data.confidence, reviewCount, nextReviewAt })
    .onConflictDoUpdate({ target: [teachBackNotes.userId, teachBackNotes.wordId], set: { simpleExplanation: parsed.data.simpleExplanation, ownExample: parsed.data.ownExample || null, confidence: parsed.data.confidence, reviewCount, nextReviewAt, updatedAt: new Date() } }).returning();
  await recordWordOutcomes(session.userId, [{ wordId: word.id, correct: parsed.data.confidence >= 2 }], "feynman");
  return NextResponse.json({ note: { confidence: note.confidence, reviewCount: note.reviewCount, nextReviewAt: note.nextReviewAt } });
}
