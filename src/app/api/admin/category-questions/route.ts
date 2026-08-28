import { NextRequest, NextResponse } from "next/server";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { categoryQuestions } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { ensureQuestionImportSchema } from "@/lib/questionImportDb";

const listSchema = z.object({ category: z.string().trim().min(1).max(128) });
const createSchema = z.object({
  category: z.string().trim().min(1).max(128),
  question: z.string().trim().min(1).max(4096),
  answer: z.string().trim().max(16384).default(""),
  phonetic: z.string().trim().max(4096).nullable().optional(),
  vnMeaning: z.string().trim().max(4096).nullable().optional(),
  questionType: z.enum(["speaking", "multiple_choice", "true_false", "essay"]).default("speaking"),
  options: z.array(z.string().trim().min(1).max(4096)).max(8).default([]),
  correctOption: z.enum(["A", "B", "C", "D"]).nullable().optional(),
  correctOptions: z.array(z.string().regex(/^[A-H]$/)).max(8).default([]),
  explanation: z.string().trim().max(16384).default(""),
  difficulty: z.enum(["easy", "medium", "hard"]).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(64)).max(30).default([]),
  speakingPart: z.enum(["part_1", "part_2", "part_3"]).nullable().optional(),
  topic: z.string().trim().max(256).nullable().optional(),
  order: z.number().int().nonnegative().default(0),
}).superRefine((data, ctx) => {
  if (["multiple_choice", "true_false"].includes(data.questionType) && data.options.length < 2) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Câu trắc nghiệm cần ít nhất 2 lựa chọn." });
  }
});
const updateSchema = z.object({
  id: z.number().int().positive(),
  question: z.string().trim().min(1).max(4096).optional(),
  answer: z.string().trim().max(16384).optional(),
  phonetic: z.string().trim().max(4096).nullable().optional(),
  vnMeaning: z.string().trim().max(4096).nullable().optional(),
  questionType: z.enum(["speaking", "multiple_choice", "true_false", "essay"]).optional(),
  options: z.array(z.string().trim().min(1).max(4096)).max(8).optional(),
  correctOption: z.enum(["A", "B", "C", "D"]).nullable().optional(),
  correctOptions: z.array(z.string().regex(/^[A-H]$/)).max(8).optional(),
  explanation: z.string().trim().max(16384).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(64)).max(30).optional(),
  speakingPart: z.enum(["part_1", "part_2", "part_3"]).nullable().optional(),
  topic: z.string().trim().max(256).nullable().optional(),
  order: z.number().int().nonnegative().optional(),
});
const deleteSchema = z.object({ ids: z.array(z.number().int().positive()).min(1).max(500) });
const reorderSchema = z.object({
  category: z.string().trim().min(1).max(128),
  orderedIds: z.array(z.number().int().positive()).min(1).max(500),
});


async function ensureTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "category_questions" (
      "id" serial PRIMARY KEY NOT NULL,
      "category" varchar(128) NOT NULL,
      "question" text NOT NULL,
      "answer" text DEFAULT '' NOT NULL,
      "phonetic" text,
      "vn_meaning" text,
      "question_type" varchar(16) DEFAULT 'speaking' NOT NULL,
      "options" text DEFAULT '[]' NOT NULL,
      "correct_option" varchar(1),
      "order" integer DEFAULT 0 NOT NULL,
      "created_by" integer,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    );
  `);
  await db.execute(sql`ALTER TABLE "category_questions" ADD COLUMN IF NOT EXISTS "question_type" varchar(16) DEFAULT 'speaking' NOT NULL;`);
  await db.execute(sql`ALTER TABLE "category_questions" ADD COLUMN IF NOT EXISTS "options" text DEFAULT '[]' NOT NULL;`);
  await db.execute(sql`ALTER TABLE "category_questions" ADD COLUMN IF NOT EXISTS "correct_option" varchar(1);`);
  await ensureQuestionImportSchema();
  try {
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "category_questions_category_idx" ON "category_questions" USING btree ("category");`);
  } catch { /* index may already exist */ }
}
async function requireAdmin() {
  const session = await getSession();
  return session?.role === "admin" ? session : null;
}

export async function GET(request: NextRequest) {
  await ensureTable();
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const parsed = listSchema.safeParse({ category: searchParams.get("category") });
  if (!parsed.success) return NextResponse.json({ error: "Thiếu tham số category." }, { status: 400 });
  const questions = await db
    .select()
    .from(categoryQuestions)
    .where(eq(categoryQuestions.category, parsed.data.category))
    .orderBy(asc(categoryQuestions.order), asc(categoryQuestions.id));
  return NextResponse.json({ questions });
}

export async function POST(request: NextRequest) {
  await ensureTable();
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu câu hỏi không hợp lệ." }, { status: 400 });
  const [maxRow] = await db
    .select({ maxOrder: categoryQuestions.order })
    .from(categoryQuestions)
    .where(eq(categoryQuestions.category, parsed.data.category))
    .orderBy(desc(categoryQuestions.order))
    .limit(1);
  const nextOrder = (maxRow?.maxOrder ?? -1) + 1;
  const [question] = await db
    .insert(categoryQuestions)
    .values({ ...parsed.data, options: JSON.stringify(parsed.data.options), correctOptions: JSON.stringify(parsed.data.correctOptions.length ? parsed.data.correctOptions : parsed.data.correctOption ? [parsed.data.correctOption] : []), tags: JSON.stringify(parsed.data.tags), order: nextOrder, createdBy: session.userId })
    .returning();
  return NextResponse.json({ question }, { status: 201 });
}


export async function PATCH(request: NextRequest) {
  await ensureTable();
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu cập nhật không hợp lệ." }, { status: 400 });
  const { id, options, correctOptions, tags, ...update } = parsed.data;
  const storedUpdate = { ...update, ...(options ? { options: JSON.stringify(options) } : {}), ...(correctOptions ? { correctOptions: JSON.stringify(correctOptions), correctOption: correctOptions[0] || update.correctOption || null } : {}), ...(tags ? { tags: JSON.stringify(tags) } : {}) };
  if (Object.keys(storedUpdate).length === 0) return NextResponse.json({ error: "Không có dữ liệu cập nhật." }, { status: 400 });
  const [question] = await db
    .update(categoryQuestions)
    .set({ ...storedUpdate, updatedAt: new Date() })
    .where(eq(categoryQuestions.id, id))
    .returning();
  if (!question) return NextResponse.json({ error: "Không tìm thấy câu hỏi." }, { status: 404 });
  return NextResponse.json({ question });
}

export async function DELETE(request: NextRequest) {
  await ensureTable();
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Danh sách câu hỏi không hợp lệ." }, { status: 400 });
  const ids = [...new Set(parsed.data.ids)];
  const deleted = await db.delete(categoryQuestions).where(inArray(categoryQuestions.id, ids)).returning({ id: categoryQuestions.id });
  return NextResponse.json({ ok: true, deleted: deleted.length });
}

export async function PUT(request: NextRequest) {
  await ensureTable();
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = reorderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu sắp xếp không hợp lệ." }, { status: 400 });
  const { category, orderedIds } = parsed.data;
  const existing = await db
    .select({ id: categoryQuestions.id })
    .from(categoryQuestions)
    .where(eq(categoryQuestions.category, category));
  const existingIds = new Set(existing.map((row) => row.id));
  if (orderedIds.length !== existing.length || !orderedIds.every((id) => existingIds.has(id))) {
    return NextResponse.json({ error: "Danh sách câu hỏi không khớp với dữ liệu hiện tại." }, { status: 409 });
  }
  await db.transaction(async (tx) => {
    for (let index = 0; index < orderedIds.length; index += 1) {
      await tx.update(categoryQuestions).set({ order: index }).where(eq(categoryQuestions.id, orderedIds[index]));
    }
  });
  const questions = await db
    .select()
    .from(categoryQuestions)
    .where(eq(categoryQuestions.category, category))
    .orderBy(asc(categoryQuestions.order), asc(categoryQuestions.id));
  return NextResponse.json({ questions });
}
