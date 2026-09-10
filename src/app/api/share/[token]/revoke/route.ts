import { NextRequest, NextResponse } from "next/server";
import { getShareByToken, revokeShare } from "@/lib/shares";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { requireAdminResourceAccess } from "@/lib/folderAuthorization";
import { getShareTargetFolderId } from "@/lib/shareFolderAuthorization";

export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  const access = await requireAdminPermission("sharing.manage");
  if (isAuthorizationError(access)) return access;
  const share = await getShareByToken(params.token);
  if (!share) return NextResponse.json({ error: "SHARE_NOT_FOUND" }, { status: 404 });
  const scoped = await requireAdminResourceAccess({ permission: "sharing.manage", folderId: await getShareTargetFolderId(share.targetType as "vocab_set" | "question_collection", share.targetId), level: "manager", access });
  if (isAuthorizationError(scoped)) return scoped;
  await revokeShare(share.id);
  return NextResponse.json({ ok: true });
}
