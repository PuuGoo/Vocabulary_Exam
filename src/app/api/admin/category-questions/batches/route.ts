import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { questionImportBatches } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { ensureQuestionImportSchema } from "@/lib/questionImportDb";

export async function GET(request: NextRequest) {
  const session = await getSession(); if (session?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await ensureQuestionImportSchema(); const category = new URL(request.url).searchParams.get("category");
  if (!category) return NextResponse.json({ error: "Thiếu category." }, { status: 400 });
  const batches = await db.select().from(questionImportBatches).where(eq(questionImportBatches.category, category)).orderBy(desc(questionImportBatches.createdAt)).limit(50);
  return NextResponse.json({ batches });
}
