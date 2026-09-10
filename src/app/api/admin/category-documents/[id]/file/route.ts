import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { categoryDocuments } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { buildCategoryDocumentResponse } from "@/lib/categoryDocumentResponse";
import { requireAdminResourceAccess } from "@/lib/folderAuthorization";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const access = await requireAdminPermission("documents.download");
  if (isAuthorizationError(access)) return access;
  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Tài liệu không hợp lệ." }, { status: 400 });
  const [document] = await db.select().from(categoryDocuments).where(eq(categoryDocuments.id, id)).limit(1);
  if (!document) return NextResponse.json({ error: "Không tìm thấy tài liệu." }, { status: 404 });
  const scoped = await requireAdminResourceAccess({ permission: "documents.download", folderId: document.folderId, level: "viewer", access });
  if (isAuthorizationError(scoped)) return scoped;
  return buildCategoryDocumentResponse(document);
}
