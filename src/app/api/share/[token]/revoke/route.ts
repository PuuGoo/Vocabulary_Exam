import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getShareByToken, revokeShare } from "@/lib/shares";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";

export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  const access = await requireAdminPermission("sharing.manage");
  if (isAuthorizationError(access)) return access;
  const share = await getShareByToken(params.token);
  if (!share) return NextResponse.json({ error: "SHARE_NOT_FOUND" }, { status: 404 });
  await revokeShare(share.id);
  return NextResponse.json({ ok: true });
}
