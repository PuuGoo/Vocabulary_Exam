import { NextResponse } from "next/server";
import { count, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categoryQuestions, contentFolders } from "@/db/schema";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select({
      folderId: categoryQuestions.folderId,
      name: contentFolders.name,
      count: count(),
    })
    .from(categoryQuestions)
    .innerJoin(contentFolders, eq(contentFolders.id, categoryQuestions.folderId))
    .where(eq(categoryQuestions.publicationStatus, "published"))
    .groupBy(categoryQuestions.folderId, contentFolders.name)
    .orderBy(asc(contentFolders.name));

  return NextResponse.json({ categories: rows });
}
