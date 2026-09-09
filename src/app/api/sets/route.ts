import { NextRequest, NextResponse } from "next/server";
import { sql, eq, or, isNull, inArray, and } from "drizzle-orm";
import { db } from "@/db";
import { vocabCategories, vocabSets, words, wordProgress, classMembers, classes, setReviewProgress } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { normalizeText } from "@/lib/text";
import { formatCategorySetName, nextCategoryOrder } from "@/lib/categorySequence";
import { z } from "zod";
import { getAdminAccess, isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { isSupportedLanguageCode } from "@/lib/languages";
import { serializeLanguageSettings } from "@/lib/languageSettings";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role === "admin" && !(await getAdminAccess(session))?.can("vocab.view")) {
    return NextResponse.json({ error: "Forbidden", code: "ADMIN_PERMISSION_REQUIRED", permission: "vocab.view" }, { status: 403 });
  }

  let classFilter;
  if (session.role !== "admin") {
    const memberships = await db
      .select({ classId: classMembers.classId })
      .from(classMembers)
      .where(eq(classMembers.userId, session.userId));
    const classIds = memberships.map((m) => m.classId);
    classFilter = classIds.length > 0 ? or(isNull(vocabSets.classId), inArray(vocabSets.classId, classIds)) : isNull(vocabSets.classId);
  }

  const query = db
    .select({
      id: vocabSets.id,
      name: vocabSets.name,
      category: vocabSets.category,
      type: vocabSets.type,
      languageCode: vocabSets.languageCode,
      translationLanguageCode: vocabSets.translationLanguageCode,
      languageSettings: vocabSets.languageSettings,
      classId: vocabSets.classId,
      className: classes.name,
      createdAt: vocabSets.createdAt,
      count: sql<number>`count(distinct ${words.id})::int`,
      unknownCount: sql<number>`count(distinct ${wordProgress.wordId}) filter (where ${wordProgress.known} = false)::int`,
      reviewStage: setReviewProgress.stage,
      nextSetReviewAt: setReviewProgress.nextReviewAt,
      initialCompletedAt: setReviewProgress.initialCompletedAt,
    })
    .from(vocabSets)
    .leftJoin(words, sql`${words.setId} = ${vocabSets.id}`)
    .leftJoin(wordProgress, and(eq(wordProgress.wordId, words.id), eq(wordProgress.userId, session.userId)))
    .leftJoin(classes, eq(classes.id, vocabSets.classId))
    .leftJoin(setReviewProgress, and(eq(setReviewProgress.setId, vocabSets.id), eq(setReviewProgress.userId, session.userId)))
    .groupBy(vocabSets.id, classes.name, setReviewProgress.stage, setReviewProgress.nextReviewAt, setReviewProgress.initialCompletedAt)
    .orderBy(vocabSets.createdAt);

  const rows = classFilter ? await query.where(classFilter) : await query;

  const categories = await db.select({ name: vocabCategories.name }).from(vocabCategories);
  const now = Date.now();
  return NextResponse.json({ sets: rows.map((row) => ({
    ...row,
    reviewStatus: !row.initialCompletedAt ? "not_started" : row.reviewStage === 4 ? "consolidated" : row.nextSetReviewAt && row.nextSetReviewAt.getTime() <= now ? "due" : "learning",
  })), categories: categories.map((category) => category.name) });
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(256),
  category: z.string().trim().max(128).nullable().optional(),
  type: z.enum(["irregular_verb", "ielts_vocab", "language_vocab"]),
  languageCode: z.string().max(16).optional(),
  translationLanguageCode: z.string().max(16).optional(),
  languageSettings: z.unknown().optional(),
  classId: z.number().int().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const access = await requireAdminPermission("vocab.create");
  if (isAuthorizationError(access)) return access;
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const languageCode = parsed.data.type === "language_vocab" ? parsed.data.languageCode : "en";
  if (!isSupportedLanguageCode(languageCode) || (parsed.data.type === "language_vocab" && languageCode !== "zh-CN")) {
    return NextResponse.json({ error: "Ngôn ngữ này chưa được hỗ trợ." }, { status: 400 });
  }
  let languageSettings: string;
  try { languageSettings = serializeLanguageSettings(parsed.data.languageSettings, languageCode); }
  catch { return NextResponse.json({ error: "Cấu hình ngôn ngữ không hợp lệ." }, { status: 400 }); }
  const category = parsed.data.category ? normalizeText(parsed.data.category) : null;
  const [set] = await db.transaction(async (tx) => {
    if (category) {
      await tx.insert(vocabCategories).values({ name: category, createdBy: access.userId }).onConflictDoNothing({ target: vocabCategories.name });
    }
    const normalizedName = normalizeText(parsed.data.name);
    const setName = category ? formatCategorySetName(await nextCategoryOrder(tx, category), normalizedName) : normalizedName;
    return tx.insert(vocabSets).values({
      name: setName,
      category,
      type: parsed.data.type,
      languageCode,
      translationLanguageCode: parsed.data.translationLanguageCode || "vi",
      languageSettings,
      classId: parsed.data.classId ?? null,
      createdBy: access.userId,
    }).returning();
  });
  return NextResponse.json({ set });
}
