import { NextRequest, NextResponse } from "next/server";
import { getAdminAccess, isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { getSession } from "@/lib/auth";
import { getGoogleOAuthConfig, parseGoogleOAuthState, storeGoogleToken } from "@/lib/googleSheets/auth";
import { GoogleSheetsError } from "@/lib/googleSheets/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", req.url));
  const access = await getAdminAccess(session);
  if (!access || !access.can("google_sheets.manage")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state") || "";
  if (!code) return NextResponse.json({ error: "Thiếu mã OAuth." }, { status: 400 });
  const parsedState = parseGoogleOAuthState(state);
  if (!parsedState || parsedState.userId !== session.userId) return NextResponse.json({ error: "Phiên OAuth không hợp lệ." }, { status: 400 });
  try {
    const config = getGoogleOAuthConfig();
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, grant_type: "authorization_code" }),
    });
    const token = await response.json().catch(() => ({}));
    if (!response.ok || !token.access_token) throw new GoogleSheetsError("Google từ chối cấp quyền.", "OAUTH_REVOKED", { retryable: false, status: 401 });
    await storeGoogleToken(session.userId, token);
    return NextResponse.redirect(new URL(parsedState.next, req.url));
  } catch (error) {
    if (error instanceof GoogleSheetsError) return NextResponse.json({ error: error.message, code: error.code }, { status: 401 });
    console.error("[google-sheets] oauth callback failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Không thể hoàn tất đăng nhập Google." }, { status: 500 });
  }
}
