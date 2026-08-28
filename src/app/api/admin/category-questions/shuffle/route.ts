import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { categoryQuestions, vocabCategories } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { parseJsonArray } from "@/lib/questionImportDb";
import { applyPermanentOptionOrder, correctAnswerDistribution } from "@/lib/questionShuffle";
import { ensureQuestionShuffleSchema } from "@/lib/questionShuffleDb";

const category = z.string().trim().min(1).max(128);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("settings"), category, shuffleQuestions: z.boolean(), shuffleOptions: z.boolean(), shuffleMode: z.enum(["random", "balanced"]) }),
  z.object({ action: z.literal("apply_options"), category, items: z.array(z.object({ id: z.number().int().positive(), optionOrder: z.array(z.number().int().nonnegative()).min(2).max(26) })).min(1).max(1000) }),
]);

export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await ensureQuestionShuffleSchema();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu shuffle không hợp lệ.", issues: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  if (input.action === "settings") {
    const [updated] = await db.update(vocabCategories).set({ shuffleQuestions: input.shuffleQuestions, shuffleOptions: input.shuffleOptions, shuffleMode: input.shuffleMode }).where(eq(vocabCategories.name, input.category)).returning({ id: vocabCategories.id });
    if (!updated) return NextResponse.json({ error: "Không tìm thấy thư mục câu hỏi." }, { status: 404 });
    return NextResponse.json({ settings: { shuffleQuestions: input.shuffleQuestions, shuffleOptions: input.shuffleOptions, shuffleMode: input.shuffleMode } });
  }

  const ids = input.items.map((item) => item.id);
  if (new Set(ids).size !== ids.length) return NextResponse.json({ error: "Danh sách shuffle chứa ID trùng." }, { status: 400 });
  const rows = await db.select().from(categoryQuestions).where(inArray(categoryQuestions.id, ids));
  if (rows.length !== ids.length || rows.some((row) => row.category !== input.category)) return NextResponse.json({ error: "Câu hỏi không thuộc đúng thư mục hoặc đã thay đổi." }, { status: 409 });
  const orderById = new Map(input.items.map((item) => [item.id, item.optionOrder]));
  const source = rows.map((row) => ({ id: row.id, options: parseJsonArray(row.options), correctOption: row.correctOption, correctOptions: parseJsonArray(row.correctOptions) }));
  let updates: Array<{ id: number; options: string[]; correctOption: string | null; correctOptions: string[] }>;
  try {
    updates = source.map((question) => ({ id: question.id, ...applyPermanentOptionOrder(question, orderById.get(question.id) || []) }));
  } catch {
    return NextResponse.json({ error: "Permutation options không còn khớp dữ liệu hiện tại." }, { status: 409 });
  }
  const beforeDistribution = correctAnswerDistribution(source);
  await db.transaction(async (tx) => {
    for (const update of updates) await tx.update(categoryQuestions).set({ options: JSON.stringify(update.options), correctOption: update.correctOption, correctOptions: JSON.stringify(update.correctOptions), updatedAt: new Date() }).where(eq(categoryQuestions.id, update.id));
  });
  const afterDistribution = correctAnswerDistribution(updates.map((update) => ({ id: update.id, options: update.options, correctOption: update.correctOption, correctOptions: update.correctOptions })));
  return NextResponse.json({ affected: updates.length, beforeDistribution, afterDistribution });
}
