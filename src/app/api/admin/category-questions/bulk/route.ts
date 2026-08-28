import { NextRequest, NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { categoryQuestions } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { ensureQuestionImportSchema } from "@/lib/questionImportDb";
const ids = z.array(z.number().int().positive()).min(1).max(1000);
const schema = z.discriminatedUnion("action", [z.object({ action: z.literal("delete"), ids }), z.object({ action: z.literal("metadata"), ids, difficulty: z.enum(["easy", "medium", "hard"]).nullable().optional(), tags: z.array(z.string().trim().min(1).max(64)).max(30).optional() }), z.object({ action: z.enum(["move", "copy", "duplicate"]), ids, category: z.string().trim().min(1).max(128).optional() })]);
export async function POST(request: NextRequest) {
  const session = await getSession(); if (session?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await ensureQuestionImportSchema(); const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Bulk action không hợp lệ." }, { status: 400 });
  const input = parsed.data;
  if (input.action === "delete") { const deleted = await db.delete(categoryQuestions).where(inArray(categoryQuestions.id, input.ids)).returning({ id: categoryQuestions.id }); return NextResponse.json({ affected: deleted.length }); }
  if (input.action === "metadata") { const update = { ...(input.difficulty !== undefined ? { difficulty: input.difficulty } : {}), ...(input.tags ? { tags: JSON.stringify(input.tags) } : {}), updatedAt: new Date() }; const changed = await db.update(categoryQuestions).set(update).where(inArray(categoryQuestions.id, input.ids)).returning({ id: categoryQuestions.id }); return NextResponse.json({ affected: changed.length }); }
  const rows = await db.select().from(categoryQuestions).where(inArray(categoryQuestions.id, input.ids));
  if (input.action === "move") { if (!input.category) return NextResponse.json({ error: "Thiếu thư mục đích." }, { status: 400 }); const changed = await db.update(categoryQuestions).set({ category: input.category, importBatchId: null, updatedAt: new Date() }).where(inArray(categoryQuestions.id, input.ids)).returning({ id: categoryQuestions.id }); return NextResponse.json({ affected: changed.length }); }
  const target = input.action === "duplicate" ? undefined : input.category; if (input.action === "copy" && !target) return NextResponse.json({ error: "Thiếu thư mục đích." }, { status: 400 });
  const [last] = await db.select({ order: categoryQuestions.order }).from(categoryQuestions).where(eq(categoryQuestions.category, target || rows[0]?.category || "")).orderBy(desc(categoryQuestions.order)).limit(1);
  const copied = rows.length ? await db.insert(categoryQuestions).values(rows.map((row, index) => ({ category: target || row.category, question: row.question, answer: row.answer, phonetic: row.phonetic, vnMeaning: row.vnMeaning, questionType: row.questionType, options: row.options, correctOption: row.correctOption, correctOptions: row.correctOptions, explanation: row.explanation, difficulty: row.difficulty, tags: row.tags, speakingPart: row.speakingPart, topic: row.topic, order: (last?.order || 0) + index + 1, createdBy: session.userId }))).returning({ id: categoryQuestions.id }) : [];
  return NextResponse.json({ affected: copied.length });
}
