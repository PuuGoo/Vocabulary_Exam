import { NextRequest, NextResponse } from "next/server";
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { categoryQuestions, questionImportBatches } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { ensureQuestionImportSchema } from "@/lib/questionImportDb";
import { normalizeQuestionIdentity } from "@/lib/questionImportParser";

const itemSchema = z.object({
  question: z.string().trim().min(1).max(4096),
  questionType: z.enum(["multiple_choice", "true_false", "essay", "speaking"]),
  options: z.array(z.string().trim().min(1).max(4096)).max(26).default([]),
  correctOptions: z.array(z.string().regex(/^[A-Z]$/)).max(26).default([]),
  answer: z.string().trim().max(16384).default(""), explanation: z.string().trim().max(16384).default(""),
  difficulty: z.enum(["easy", "medium", "hard"]).nullable().default(null),
  tags: z.array(z.string().trim().min(1).max(64)).max(30).default([]),
  speakingPart: z.enum(["part_1", "part_2", "part_3"]).nullable().default(null), topic: z.string().trim().max(256).nullable().default(null),
  status: z.enum(["ready", "needs_review"]).default("ready"), duplicateAction: z.enum(["skip", "import"]).default("skip"),
}).superRefine((item, ctx) => {
  if (["multiple_choice", "true_false"].includes(item.questionType) && item.options.length < 2) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "MISSING_OPTIONS" });
  if (item.correctOptions.some((id) => !item.options[id.charCodeAt(0) - 65])) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "INVALID_CORRECT_ANSWER" });
});
const schema = z.object({ category: z.string().trim().min(1).max(128), sourceType: z.enum(["clipboard", "xlsx", "other"]), items: z.array(itemSchema).min(1).max(5000) });

export async function POST(request: NextRequest) {
  const session = await getSession(); if (session?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await ensureQuestionImportSchema();
  const parsed = schema.safeParse(await request.json().catch(() => null));
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
    const [created] = await tx.insert(questionImportBatches).values({ category, sourceType, totalItems: items.length, successItems: accepted.length, reviewItems: accepted.filter((item) => item.status === "needs_review").length, failedItems: 0, createdBy: session.userId }).returning();
    for (let start = 0; start < accepted.length; start += 250) {
      const chunk = accepted.slice(start, start + 250);
      await tx.insert(categoryQuestions).values(chunk.map((item, offset) => ({ category, question: item.question, answer: item.answer, questionType: item.questionType === "true_false" ? "multiple_choice" : item.questionType, options: JSON.stringify(item.options), correctOption: item.correctOptions[0] || null, correctOptions: JSON.stringify(item.correctOptions), explanation: item.explanation, difficulty: item.difficulty, tags: JSON.stringify(item.tags), speakingPart: item.speakingPart, topic: item.topic, order: (last?.order ?? -1) + start + offset + 1, importBatchId: created.id, createdBy: session.userId })));
    }
    return created;
  });
  return NextResponse.json({ batch, imported: accepted.length, skippedDuplicates }, { status: 201 });
}
