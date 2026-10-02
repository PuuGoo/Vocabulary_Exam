import { NextResponse } from "next/server";
import { GoogleSheetsError } from "@/lib/googleSheets/errors";

/**
 * Shared OAuth onboarding helpers for Google Sheets.
 *
 * A missing Google connection is an expected onboarding state, not an app
 * failure: the API returns a structured "connect first" payload and the admin
 * UI redirects to the existing OAuth start endpoint instead of dying on a 401.
 */
const OAUTH_START_PATH = "/api/admin/google-sheets/oauth/start";

export function isLocalNext(next: string | null | undefined): boolean {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\");
}

/**
 * The continuation URL the OAuth start endpoint must return to.
 *
 * `gSheetCreate=1` marks the pending create-sheet action so the set page can
 * offer (or auto-run) the continuation after the token is stored.
 */
export function createSheetContinuation(setId: number): string {
  return `/admin/sets?openSet=${setId}&gSheetCreate=1`;
}

/** Signed OAuth start URL for a create-sheet continuation. */
export function createSheetOAuthStartUrl(next: string): string {
  return `${OAUTH_START_PATH}?next=${encodeURIComponent(next)}`;
}

/**
 * Stable, non-technical message shown in the normal admin UI. Raw Google API
 * errors are logged server-side only and never echoed to the browser.
 */
export function googleSheetsUiMessage(code: string | undefined, fallback: string): string {
  switch (code) {
    case "NOT_CONFIGURED": return "Google OAuth chưa được cấu hình trên máy chủ.";
    case "OAUTH_REQUIRED": return "Kết nối Google để tiếp tục.";
    case "OAUTH_REVOKED": return "Google đã thu hồi quyền truy cập. Vui lòng kết nối lại tài khoản Google.";
    case "PERMISSION_DENIED": return "Bạn không có quyền truy cập Google Sheet này.";
    case "SHEET_NOT_FOUND": return "Không tìm thấy Google Sheet (có thể đã bị xóa hoặc thu hồi quyền).";
    case "INVALID_SCHEMA": return "Dữ liệu Google Sheet không đúng định dạng mà Lexora yêu cầu.";
    case "RATE_LIMITED": return "Google đang giới hạn số lời gọi. Vui lòng thử lại sau ít phút.";
    case "TIMEOUT":
    case "NETWORK": return "Mạng hoặc Google đang chậm. Vui lòng thử lại.";
    default: return fallback;
  }
}

export type CreateSheetApiOutcome =
  | { kind: "connected"; body: Record<string, unknown>; status: number }
  | { kind: "need_oauth"; body: Record<string, unknown>; status: number }
  | { kind: "already_connected"; body: Record<string, unknown>; status: number }
  | { kind: "configuration_required"; body: Record<string, unknown>; status: number }
  | { kind: "failed"; body: Record<string, unknown>; status: number };

/**
 * Map a thrown GoogleSheetsError to the response contract used by
 * POST /api/admin/google-sheets/create. OAUTH_REQUIRED is deliberately not an
 * HTTP 401: the admin UI receives an oauthUrl and redirects to the existing
 * OAuth flow automatically.
 */
export function createSheetErrorOutcome(error: unknown, setId: number): CreateSheetApiOutcome {
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const retryable = typeof error === "object" && error !== null && "retryable" in error ? Boolean((error as { retryable?: unknown }).retryable) : true;

  if (code === "OAUTH_REQUIRED") {
    return {
      kind: "need_oauth",
      status: 202,
      body: {
        error: "Kết nối Google để tiếp tục.",
        code,
        retryable: false,
        oauthRequired: true,
        oauthUrl: createSheetOAuthStartUrl(createSheetContinuation(setId)),
        setId,
      },
    };
  }
  if (code === "INVALID_SCHEMA") {
    // Existing implementation throws the "already connected" case with
    // INVALID_SCHEMA + status 409; keep that contract idempotent.
    const alreadyConnected = typeof error === "object" && error !== null && (error as { status?: number }).status === 409;
    if (alreadyConnected) return { kind: "already_connected", status: 409, body: { error: googleSheetsUiMessage(code, "Bộ từ vựng này đã kết nối Google Sheet."), code, retryable, setId } };
    return { kind: "failed", status: 409, body: { error: googleSheetsUiMessage(code, "Dữ liệu Google Sheet không hợp lệ."), code, retryable, setId } };
  }
  if (code === "NOT_CONFIGURED") {
    return { kind: "configuration_required", status: 501, body: { error: googleSheetsUiMessage(code, "Google OAuth chưa được cấu hình."), code, retryable: false, setId } };
  }
  if (code === "OAUTH_REVOKED" || code === "PERMISSION_DENIED") {
    return {
      kind: "need_oauth",
      status: 202,
      body: {
        error: googleSheetsUiMessage(code, "Kết nối Google để tiếp tục."),
        code,
        retryable: false,
        oauthRequired: true,
        oauthUrl: createSheetOAuthStartUrl(createSheetContinuation(setId)),
        setId,
      },
    };
  }
  return { kind: "failed", status: 502, body: { error: googleSheetsUiMessage(code, "Không thể tạo Google Sheet lúc này."), code: code || "UNKNOWN", retryable, setId } };
}

/** JSON response built from a mapped outcome. */
export function createSheetJson(outcome: { body: Record<string, unknown>; status: number }): NextResponse {
  return NextResponse.json(outcome.body, { status: outcome.status });
}

/** Safe, same-site continuation URL for the OAuth callback to return to. */
export function safeSetContinuation(setId: unknown): string | null {
  const parsed = typeof setId === "string" || typeof setId === "number" ? Number(setId) : NaN;
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return createSheetContinuation(parsed);
}

export function continuationFromOAuthNext(next: string | null | undefined): string {
  return isLocalNext(next) ? next! : "/admin/sets";
}

/** Convenience for the OAuth callback: same-site path only. */
export function redirectTargetFor(next: string | null | undefined): string {
  return isLocalNext(next) ? next! : "/admin/sets";
}

/**
 * Outcome contract for the OAuth callback.
 *
 * The callback itself never creates a spreadsheet: it stores the token and
 * hands the browser back to the set page, where the UI either auto-resumes the
 * create action or offers an explicit "Tiếp tục tạo Google Sheet" button.
 */
export type OAuthCallbackOutcome =
  | { kind: "redirect"; location: string; autoCreate: boolean; pendingCreate?: boolean }
  | { kind: "failed"; body: Record<string, unknown>; status: number };

export function buildOAuthCallbackRedirect(next: string | null | undefined, options?: { autoCreate?: boolean; pendingCreate?: boolean }): OAuthCallbackOutcome {
  const target = redirectTargetFor(next);
  const url = new URL(target, "http://localhost");
  if (options?.autoCreate) url.searchParams.set("gSheetCreate", "1");
  if (options?.pendingCreate) url.searchParams.set("gSheetPending", "1");
  return { kind: "redirect", location: `${url.pathname}${url.search}`, autoCreate: Boolean(options?.autoCreate), pendingCreate: options?.pendingCreate };
}

export function buildOAuthCallbackFailure(error: unknown): OAuthCallbackOutcome {
  if (error instanceof GoogleSheetsError) {
    return { kind: "failed", status: 401, body: { error: "Google đã từ chối cấp quyền. Vui lòng thử lại.", code: error.code, retryable: false } };
  }
  console.error("[google-sheets] oauth callback failed", error instanceof Error ? error.message : "unknown");
  return { kind: "failed", status: 500, body: { error: "Không thể hoàn tất đăng nhập Google.", code: "UNKNOWN", retryable: true } };
}