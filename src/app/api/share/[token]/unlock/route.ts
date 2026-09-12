import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getShareByIdentifier } from "@/lib/shares";
import { clearShareUnlockFailures, createShareAccessProof, recordShareUnlockFailure, shareAccessCookieName, shareAccessCookieOptions, shareUnlockRateStatus, validateSharePassword, verifySharePassword } from "@/lib/sharePassword";

export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  const share = await getShareByIdentifier(params.token);
  if (!share) return NextResponse.json({ error: "Liên kết này không còn khả dụng.", code: "SHARE_NOT_FOUND" }, { status: 404 });
  if (!share.passwordEnabled || !share.passwordHash) return NextResponse.json({ success: true });
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const clientKey = createHash("sha256").update(`${share.id}:${forwarded}`).digest("hex");
  const rate = shareUnlockRateStatus(clientKey);
  if (rate.limited) return NextResponse.json({ error: "Bạn đã thử quá nhiều lần. Vui lòng đợi một lúc rồi thử lại.", code: "SHARE_UNLOCK_RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds || 60) } });
  const body = await request.json().catch(() => null) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  if (validateSharePassword(password) || !await verifySharePassword(password, share.passwordHash)) {
    const after = recordShareUnlockFailure(clientKey);
    console.warn("[share-password] unlock failed", { shareId: share.id });
    if (after.limited) return NextResponse.json({ error: "Bạn đã thử quá nhiều lần. Vui lòng đợi một lúc rồi thử lại.", code: "SHARE_UNLOCK_RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(after.retryAfterSeconds || 60) } });
    return NextResponse.json({ error: "Mật khẩu không đúng. Vui lòng kiểm tra và thử lại.", code: "SHARE_PASSWORD_INCORRECT" }, { status: 401 });
  }
  clearShareUnlockFailures(clientKey);
  const proof = await createShareAccessProof(share.id, share.passwordVersion);
  const response = NextResponse.json({ success: true });
  response.cookies.set(shareAccessCookieName(share.id), proof, shareAccessCookieOptions());
  console.info("[share-password] unlock success", { shareId: share.id });
  return response;
}
