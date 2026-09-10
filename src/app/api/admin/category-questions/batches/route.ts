import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { questionImportBatches } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { ensureQuestionImportSchema } from "@/lib/questionImportDb";
import { authorizeQuestionCategory } from "@/lib/questionFolderAuthorization";

export async function GET(request: NextRequest) {
  const access = await requireAdminPermission("questions.view"); if (isAuthorizationError(access)) return access;
  await ensureQuestionImportSchema(); const category = new URL(request.url).searchParams.get("category");
  if (!category) return NextResponse.json({ error: "Thiếu category." }, { status: 400 });
  const scoped = await authorizeQuestionCategory(access, category, Number(new URL(request.url).searchParams.get("folderId")) || null, "questions.view", "viewer"); if (scoped.error) return scoped.error;
  const batches = await db.select().from(questionImportBatches).where(eq(questionImportBatches.folderId, scoped.folderId)).orderBy(desc(questionImportBatches.createdAt)).limit(50);
  return NextResponse.json({ batches });
}
