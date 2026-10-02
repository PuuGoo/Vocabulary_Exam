import { NextRequest, NextResponse } from "next/server";
import { getAdminAccess, isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { getSession } from "@/lib/auth";
import { getGoogleOAuthConfig, googleOAuthStateFor, GOOGLE_SHEETS_SCOPES, isGoogleOAuthConfigured } from "@/lib/googleSheets/auth";
import { isLocalNext } from "@/lib/googleSheets/createFlow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Start the existing Google OAuth flow.
 *
 * `next` carries the continuation URL (for example
 * `/admin/sets?openSet=123`) so the callback can return to the originating
 * Vocabulary Set page. It must stay same-site: anything else falls back to the
 * default admin route.
 */
export async function GET(req: NextRequest) {
  const access = await requireAdminPermission("google_sheets.manage");
  if (isAuthorizationError(access)) return access;
  if (!isGoogleOAuthConfigured()) return NextResponse.json({ error: "Google OAuth chưa được cấu hình trên máy chủ.", code: "NOT_CONFIGURED" }, { status: 501 });
  const config = getGoogleOAuthConfig();
  const next = isLocalNext(req.nextUrl.searchParams.get("next")) ? req.nextUrl.searchParams.get("next")! : "/admin/sets";
  const state = googleOAuthStateFor(access.userId, next);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SHEETS_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return NextResponse.redirect(url.toString());
}
