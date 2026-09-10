import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { categoryDocumentUploads } from "@/db/schema";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { requireAdminResourceAccess } from "@/lib/folderAuthorization";

export async function DELETE(_request: Request, { params }: { params: { uploadId: string } }) {
  const access = await requireAdminPermission("documents.upload");
  if (isAuthorizationError(access)) return access;
  const [upload] = await db.select({ folderId: categoryDocumentUploads.folderId }).from(categoryDocumentUploads).where(and(eq(categoryDocumentUploads.id, params.uploadId), eq(categoryDocumentUploads.createdBy, access.userId))).limit(1);
  if (!upload) return Response.json({ error: "Not found" }, { status: 404 });
  const scoped = await requireAdminResourceAccess({ permission: "documents.upload", folderId: upload.folderId, level: "editor", access });
  if (isAuthorizationError(scoped)) return scoped;
  await db.delete(categoryDocumentUploads).where(and(
    eq(categoryDocumentUploads.id, params.uploadId), eq(categoryDocumentUploads.createdBy, access.userId),
  ));
  return Response.json({ ok: true });
}
