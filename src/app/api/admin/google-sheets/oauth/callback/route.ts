import { NextRequest, NextResponse } from "next/server";
import { getAdminAccess, isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { getSession } from "@/lib/auth";
import { getGoogleOAuthConfig, parseGoogleOAuthState, storeGoogleToken } from "@/lib/googleSheets/auth";
import { GoogleSheetsError } from "@/lib/googleSheets/errors";
import { buildOAuthCallbackFailure, buildOAuthCallbackRedirect, createSheetContinuation, isLocalNext } from "@/lib/googleSheets/createFlow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Google OAuth callback.
 *
 * It only persists the token and returns the browser to the continuation URL
 * carried in the signed `state` (for example
 * `/admin/sets?openSet=123&gSheetCreate=1`). It never creates a spreadsheet
 * here, so a replayed/refreshed callback can never create duplicate sheets;
 * the create API itself is idempotent per set as well.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", req.url));
  const access = await getAdminAccess(session);

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state") || "";
  const denied = req.nextUrl.searchParams.get("error");
  const parsedState = parseGoogleOAuthState(state);
  const plannerFlow = parsedState?.next === "/study-planner" && parsedState.userId === session.userId;
  if (!plannerFlow && (!access || !access.can("google_sheets.manage"))) return NextResponse.json({ error: "Forbidden", code: "ADMIN_PERMISSION_REQUIRED" }, { status: 403 });
  if (plannerFlow && denied) return NextResponse.redirect(new URL("/study-planner?googleError=1", req.url));

  // A denied consent, an invalid state and a missing code must all land on a
  // usable page instead of a raw technical error.
  if (denied) return redirectToContinuation(req, parsedState?.next, { failed: true });
  if (!code) return NextResponse.json({ error: "Thiếu mã OAuth.", code: "INVALID_SCHEMA" }, { status: 400 });
  if (!parsedState || parsedState.userId !== session.userId) return NextResponse.json({ error: "Phiên OAuth không hợp lệ.", code: "INVALID_SCHEMA" }, { status: 400 });

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
    if (plannerFlow) return NextResponse.redirect(new URL("/study-planner", req.url));

    // Resume the pending create-sheet action when the admin started it from a
    // set page. The continuation is only trusted when it is same-site and still
    // points at that set, so the setId cannot be swapped mid-flow.
    const outcome = buildOAuthCallbackRedirect(parsedState.next, {
      autoCreate: isCreateContinuation(parsedState.next),
      pendingCreate: isCreateContinuation(parsedState.next),
    });
    if (outcome.kind !== "redirect") return NextResponse.json(outcome.body, { status: outcome.status });
    return NextResponse.redirect(new URL(outcome.location, req.url));
  } catch (error) {
    if (plannerFlow) return NextResponse.redirect(new URL("/study-planner?googleError=1", req.url));
    const failure = buildOAuthCallbackFailure(error);
    if (failure.kind === "failed") {
      if (isLocalNext(parsedState.next)) return redirectToContinuation(req, parsedState.next, { failed: true });
      return NextResponse.json(failure.body, { status: failure.status });
    }
    return NextResponse.redirect(new URL(failure.location, req.url));
  }
}

/** True when the continuation is the create-sheet flow for a specific set. */
function isCreateContinuation(next: string | null | undefined): boolean {
  if (!isLocalNext(next)) return false;
  const url = new URL(next!, "http://localhost");
  return url.pathname === "/admin/sets" && url.searchParams.has("openSet") && url.searchParams.get("gSheetCreate") === "1";
}

function redirectToContinuation(req: NextRequest, next: string | null | undefined, options: { failed?: boolean } = {}) {
  const outcome = buildOAuthCallbackRedirect(next, {});
  if (outcome.kind !== "redirect") return NextResponse.json({ error: "Không thể đăng nhập Google.", code: "UNKNOWN" }, { status: 500 });
  const url = new URL(outcome.location, req.url);
  if (options.failed) {
    url.searchParams.set("gSheetError", "1");
    url.searchParams.set("openSet", url.searchParams.get("openSet") ?? "");
  }
  return NextResponse.redirect(url.toString());
}
