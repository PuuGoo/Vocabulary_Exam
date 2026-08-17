import { NextResponse } from "next/server";
import { count, asc } from "drizzle-orm";
import { db } from "@/db";
import { categoryQuestions } from "@/db/schema";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select({
      name: categoryQuestions.category,
      count: count(),
    })
    .from(categoryQuestions)
    .groupBy(categoryQuestions.category)
    .orderBy(asc(categoryQuestions.category));

  return NextResponse.json({ categories: rows });
}