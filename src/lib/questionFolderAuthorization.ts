import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { categoryQuestions, questionImportBatches } from "@/db/schema";
import type { AdminAccess } from "@/lib/adminAuthorization";
import type { AdminPermission } from "@/lib/adminPermissions";
import { findVisibleFolderIdByLegacyPath, requireAdminResourceAccess } from "@/lib/folderAuthorization";

export async function authorizeQuestionIds(access: AdminAccess, ids: number[], permission: AdminPermission, level: "viewer" | "editor" | "manager") {
  const uniqueIds = [...new Set(ids)];
  const rows = await db.select({ id: categoryQuestions.id, folderId: categoryQuestions.folderId }).from(categoryQuestions).where(inArray(categoryQuestions.id, uniqueIds));
  if (rows.length !== uniqueIds.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  for (const folderId of new Set(rows.map((row) => row.folderId))) {
    const result = await requireAdminResourceAccess({ permission, folderId, level, access });
    if (result instanceof NextResponse) return result;
  }
  return null;
}

export async function authorizeQuestionCategory(access: AdminAccess, category: string, folderId: number | null | undefined, permission: AdminPermission, level: "viewer" | "editor" | "manager") {
  const resolved = folderId ?? await findVisibleFolderIdByLegacyPath(access, category);
  const result = await requireAdminResourceAccess({ permission, folderId: resolved, level, access });
  return result instanceof NextResponse ? { error: result, folderId: null } : { error: null, folderId: resolved! };
}

export async function authorizeQuestionBatch(access: AdminAccess, batchId: number, permission: AdminPermission, level: "viewer" | "editor" | "manager") {
  const [batch] = await db.select({ folderId: questionImportBatches.folderId }).from(questionImportBatches).where(eq(questionImportBatches.id, batchId)).limit(1);
  const result = await requireAdminResourceAccess({ permission, folderId: batch?.folderId, level, access });
  return result instanceof NextResponse ? result : null;
}
