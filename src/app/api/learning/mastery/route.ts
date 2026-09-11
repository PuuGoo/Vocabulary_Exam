import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { classMembers, vocabSets, words } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { getAdminAccess, isAuthorizationError } from "@/lib/adminAuthorization";
import { requireAdminResourceAccess } from "@/lib/folderAuthorization";
import { isLearningSkill, type LearningSkill } from "@/lib/learningSkills";
import { buildSetMasterySummary, getSkillProgressForWords, recordSkillOutcome } from "@/lib/skillMasteryService";

const outcomeSchema = z.object({
  wordId: z.number().int().positive(),
  skill: z.string().refine(isLearningSkill),
  result: z.enum(["correct", "assisted", "near_miss", "incorrect"]),
  sourceMode: z.string().trim().min(1).max(32),
  eventKey: z.string().trim().min(8).max(128),
});

async function learnerCanAccessSet(session: NonNullable<Awaited<ReturnType<typeof getSession>>>, setId: number) {
  const [set] = await db.select({ id: vocabSets.id, publicationStatus: vocabSets.publicationStatus, classId: vocabSets.classId, folderId: vocabSets.folderId }).from(vocabSets).where(eq(vocabSets.id, setId)).limit(1);
  if (!set) return false;
  if (session.role === "admin") {
    const access = await getAdminAccess(session);
    if (!access?.can("vocab.view")) return false;
    return !isAuthorizationError(await requireAdminResourceAccess({ permission: "vocab.view", folderId: set.folderId, level: "viewer", access }));
  }
  if (set.publicationStatus !== "published") return false;
  if (set.classId == null) return true;
  const [membership] = await db.select({ id: classMembers.id }).from(classMembers).where(and(eq(classMembers.userId, session.userId), eq(classMembers.classId, set.classId))).limit(1);
  return Boolean(membership);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = outcomeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu kết quả không hợp lệ." }, { status: 400 });
  const [word] = await db.select({ id: words.id, setId: words.setId }).from(words).where(eq(words.id, parsed.data.wordId)).limit(1);
  if (!word || !(await learnerCanAccessSet(session, word.setId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const result = await recordSkillOutcome(session.userId, { ...parsed.data, skill: parsed.data.skill as LearningSkill });
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const setId = Number(req.nextUrl.searchParams.get("setId"));
  if (!Number.isInteger(setId) || setId < 1 || !(await learnerCanAccessSet(session, setId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const wordRows = await db.select({ id: words.id }).from(words).where(and(eq(words.setId, setId)));
  const progress = await getSkillProgressForWords(session.userId, wordRows.map((row) => row.id));
  const byWord = new Map<number, typeof progress>();
  for (const row of progress) byWord.set(row.wordId, [...(byWord.get(row.wordId) || []), row]);
  return NextResponse.json({ summary: buildSetMasterySummary(progress), words: Object.fromEntries([...byWord].map(([wordId, rows]) => [wordId, buildSetMasterySummary(rows)])) });
}
