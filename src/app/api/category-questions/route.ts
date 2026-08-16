import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { categoryQuestions } from "@/db/schema";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    })
    .from(categoryQuestions)
    .where(eq(categoryQuestions.category, category))
    .orderBy(sql`${categoryQuestions.order} asc, ${categoryQuestions.id} asc`);

  return NextResponse.json({ questions });
}