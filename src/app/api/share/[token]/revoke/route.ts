import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getShareByToken, revokeShare } from "@/lib/shares";

export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const share = await getShareByToken(params.token);
  if (!share) return NextResponse.json({ error: "SHARE_NOT_FOUND" }, { status: 404 });
  await revokeShare(share.id);
  return NextResponse.json({ ok: true });
}
