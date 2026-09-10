import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { categoryQuestions, questionImportBatches } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { ensureQuestionImportSchema } from "@/lib/questionImportDb";
import { authorizeQuestionBatch } from "@/lib/questionFolderAuthorization";

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireAdminPermission("questions.delete"); if (isAuthorizationError(access)) return access;
  const id = Number(params.id); if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Batch không hợp lệ." }, { status: 400 });
  await ensureQuestionImportSchema();
  const denied = await authorizeQuestionBatch(access, id, "questions.delete", "manager"); if (denied) return denied;
  const result = await db.transaction(async (tx) => {
    const [batch] = await tx.select().from(questionImportBatches).where(and(eq(questionImportBatches.id, id), isNull(questionImportBatches.undoneAt))).limit(1);
    if (!batch) return null;
    const deleted = await tx.delete(categoryQuestions).where(eq(categoryQuestions.importBatchId, id)).returning({ id: categoryQuestions.id });
    await tx.update(questionImportBatches).set({ status: "undone", undoneAt: new Date() }).where(eq(questionImportBatches.id, id));
    return { batch, deleted: deleted.length };
  });
  if (!result) return NextResponse.json({ error: "Batch không tồn tại hoặc đã hoàn tác." }, { status: 404 });
  return NextResponse.json(result);
}
