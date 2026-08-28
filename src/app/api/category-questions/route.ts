import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { categoryQuestions } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { ensureQuestionImportSchema, parseJsonArray } from "@/lib/questionImportDb";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await db.execute(sql`ALTER TABLE "category_questions" ADD COLUMN IF NOT EXISTS "question_type" varchar(16) DEFAULT 'speaking' NOT NULL;`);
  await db.execute(sql`ALTER TABLE "category_questions" ADD COLUMN IF NOT EXISTS "options" text DEFAULT '[]' NOT NULL;`);
  await db.execute(sql`ALTER TABLE "category_questions" ADD COLUMN IF NOT EXISTS "correct_option" varchar(1);`);
  await ensureQuestionImportSchema();

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  if (!category) return NextResponse.json({ error: "Thiếu tham số category." }, { status: 400 });

  const questions = await db
    .select({
      id: categoryQuestions.id,
      vnMeaning: categoryQuestions.vnMeaning,
      phonetic: categoryQuestions.phonetic,
      question: categoryQuestions.question,
      answer: categoryQuestions.answer,
      questionType: categoryQuestions.questionType,
      options: categoryQuestions.options,
      correctOption: categoryQuestions.correctOption,
      correctOptions: categoryQuestions.correctOptions,
      explanation: categoryQuestions.explanation,
      difficulty: categoryQuestions.difficulty,
      tags: categoryQuestions.tags,
      speakingPart: categoryQuestions.speakingPart,
      topic: categoryQuestions.topic,
    })
    .from(categoryQuestions)
    .where(eq(categoryQuestions.category, category))
    .orderBy(sql`${categoryQuestions.order} asc, ${categoryQuestions.id} asc`);

  return NextResponse.json({ questions: questions.map((question) => ({
    ...question,
    options: (() => { try { return JSON.parse(question.options); } catch { return []; } })(),
    correctOptions: parseJsonArray(question.correctOptions).length ? parseJsonArray(question.correctOptions) : question.correctOption ? [question.correctOption] : [],
    tags: parseJsonArray(question.tags),
  })) });
}
