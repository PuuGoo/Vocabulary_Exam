import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { shareLinks } from "@/db/schema";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { requireAdminResourceAccess } from "@/lib/folderAuthorization";
import { getShareTargetFolderId } from "@/lib/shareFolderAuthorization";

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireAdminPermission("sharing.manage");
  if (isAuthorizationError(access)) return access;
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid share" }, { status: 400 });
  const [share] = await db.select().from(shareLinks).where(eq(shareLinks.id, id)).limit(1);
  if (!share) return NextResponse.json({ error: "SHARE_NOT_FOUND" }, { status: 404 });
  const scoped = await requireAdminResourceAccess({ permission: "sharing.manage", folderId: await getShareTargetFolderId(share.targetType as "vocab_set" | "question_collection", share.targetId), level: "manager", access });
  if (isAuthorizationError(scoped)) return scoped;
  await db.update(shareLinks).set({ accessMode: "restricted", revokedAt: new Date(), updatedAt: new Date() }).where(eq(shareLinks.id, id));
  return NextResponse.json({ ok: true });
}
