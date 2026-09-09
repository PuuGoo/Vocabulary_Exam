import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { categoryDocumentUploads } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";

export async function DELETE(_request: Request, { params }: { params: { uploadId: string } }) {
  const access = await requireAdminPermission("documents.upload");
  if (isAuthorizationError(access)) return access;
  await db.delete(categoryDocumentUploads).where(and(
    eq(categoryDocumentUploads.id, params.uploadId), eq(categoryDocumentUploads.createdBy, access.userId),
  ));
  return Response.json({ ok: true });
}
