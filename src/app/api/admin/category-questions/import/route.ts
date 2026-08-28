import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categoryQuestions, questionImportBatches } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { ensureQuestionImportSchema } from "@/lib/questionImportDb";
import { normalizeQuestionIdentity } from "@/lib/questionImportParser";
import { questionImportRequestSchema } from "@/lib/questionImportValidation";

export async function POST(request: NextRequest) {
  const session = await getSession(); if (session?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await ensureQuestionImportSchema();
  const parsed = questionImportRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu import không hợp lệ.", details: parsed.error.issues }, { status: 400 });
  const { category, sourceType, items } = parsed.data;
  const existing = await db.select({ question: categoryQuestions.question }).from(categoryQuestions).where(eq(categoryQuestions.category, category));
  const identities = new Set(existing.map((row) => normalizeQuestionIdentity(row.question)));
  const accepted = items.filter((item) => {
    const identity = normalizeQuestionIdentity(item.question); const duplicate = identities.has(identity);
    if (duplicate && item.duplicateAction === "skip") return false;
    identities.add(identity); return true;
  });
  const skippedDuplicates = items.length - accepted.length;
  const [last] = await db.select({ order: categoryQuestions.order }).from(categoryQuestions).where(eq(categoryQuestions.category, category)).orderBy(desc(categoryQuestions.order)).limit(1);
  const batch = await db.transaction(async (tx) => {
    const [created] = await tx.insert(questionImportBatches).values({ category, sourceType, totalItems: items.length, successItems: accepted.length, reviewItems: 0, failedItems: 0, createdBy: session.userId }).returning();
    for (let start = 0; start < accepted.length; start += 250) {
      const chunk = accepted.slice(start, start + 250);
      await tx.insert(categoryQuestions).values(chunk.map((item, offset) => ({ category, question: item.question, answer: item.answer, questionType: item.questionType === "true_false" ? "multiple_choice" : item.questionType, options: JSON.stringify(item.options), correctOption: item.correctOptions[0] || null, correctOptions: JSON.stringify(item.correctOptions), explanation: item.explanation, difficulty: item.difficulty, tags: JSON.stringify(item.tags), speakingPart: item.speakingPart, topic: item.topic, order: (last?.order ?? -1) + start + offset + 1, importBatchId: created.id, createdBy: session.userId })));
    }
    return created;
  });
  return NextResponse.json({ batch, imported: accepted.length, skippedDuplicates }, { status: 201 });
}
