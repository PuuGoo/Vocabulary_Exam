import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { GoogleSheetsError } from "@/lib/googleSheets/errors";
import {
  buildOAuthCallbackFailure,
  buildOAuthCallbackRedirect,
  continuationFromOAuthNext,
  createSheetContinuation,
  createSheetErrorOutcome,
  createSheetOAuthStartUrl,
  isLocalNext,
  safeSetContinuation,
} from "@/lib/googleSheets/createFlow";

const OAUTH_START_PATH = "/api/admin/google-sheets/oauth/start";

/**
 * A missing Google connection is an expected onboarding state. The API must not
 * answer 401 (which leaves the admin stuck) but a structured "connect first"
 * payload pointing at the existing OAuth start endpoint.
 */

// ---------------------------------------------------------- B: OAuth flow starts
test("B. not connected: create answers 202 with an OAuth URL, never 401", () => {
  const outcome = createSheetErrorOutcome(new GoogleSheetsError("Bạn cần kết nối tài khoản Google trước.", "OAUTH_REQUIRED", { retryable: false }), 123);

  assert.equal(outcome.kind, "need_oauth");
  assert.equal(outcome.status, 202, "OAUTH_REQUIRED must not be a hard 401 failure");
  assert.equal(outcome.body.oauthRequired, true);
  assert.equal(outcome.body.error, "Kết nối Google để tiếp tục.");
  assert.equal(outcome.body.setId, 123, "the setId must survive the redirect");
  assert.equal(outcome.body.oauthUrl, `${OAUTH_START_PATH}?next=%2Fadmin%2Fsets%3FopenSet%3D123%26gSheetCreate%3D1`);
});

test("B. the OAuth start URL points at the existing endpoint, no second implementation", () => {
  const url = createSheetOAuthStartUrl(createSheetContinuation(42));
  assert.ok(url.startsWith(`${OAUTH_START_PATH}?`));
  const parsed = new URL(url, "http://localhost");
  assert.equal(parsed.searchParams.get("next"), "/admin/sets?openSet=42&gSheetCreate=1");
});

test("B. the continuation preserves the setId across the OAuth redirect", () => {
  assert.equal(createSheetContinuation(7), "/admin/sets?openSet=7&gSheetCreate=1");
  assert.equal(safeSetContinuation("7"), "/admin/sets?openSet=7&gSheetCreate=1");
  assert.equal(safeSetContinuation(0), null);
  assert.equal(safeSetContinuation(-3), null);
  assert.equal(safeSetContinuation("abc"), null);
  assert.equal(safeSetContinuation(null), null);
});

// ---------------------------------------------------------- C: callback returns
test("C. the callback returns to the originating set with the create action kept", () => {
  const outcome = buildOAuthCallbackRedirect(createSheetContinuation(123), { autoCreate: true, pendingCreate: true });
  assert.equal(outcome.kind, "redirect");
  if (outcome.kind !== "redirect") return;
  const url = new URL(outcome.location, "http://localhost");
  assert.equal(url.pathname, "/admin/sets");
  assert.equal(url.searchParams.get("openSet"), "123");
  assert.equal(url.searchParams.get("gSheetCreate"), "1");
  assert.equal(outcome.autoCreate, true);
});

test("C. an off-site or malformed continuation never leaks through", () => {
  for (const hostile of ["https://evil.example/steal", "//evil.example", "javascript:alert(1)", null, undefined, "admin/sets"]) {
    assert.equal(isLocalNext(hostile), false, String(hostile));
  }
  assert.equal(continuationFromOAuthNext("https://evil.example"), "/admin/sets");
  const outcome = buildOAuthCallbackRedirect("https://evil.example/steal", { autoCreate: true });
  assert.equal(outcome.kind, "redirect");
  if (outcome.kind !== "redirect") return;
  assert.equal(outcome.location, "/admin/sets?gSheetCreate=1", "off-site continuations must fall back to the admin route and never carry the hostile target");
});

// ---------------------------------------------------------- D: replay safety
test("D. a replayed callback never carries a create instruction of its own", () => {
  // The callback only stores the token; the create flag comes from the signed
  // state, so refreshing the callback cannot create a second spreadsheet.
  const callback = readFileSync("src/app/api/admin/google-sheets/oauth/callback/route.ts", "utf8");
  assert.ok(!callback.includes("createGoogleSheetForSet"), "the callback must never create a spreadsheet");
  assert.match(callback, /storeGoogleToken/);
  assert.match(callback, /parseGoogleOAuthState/);
});

test("D. create is idempotent per set: an existing connection is returned, not duplicated", () => {
  const create = readFileSync("src/app/api/admin/google-sheets/create/route.ts", "utf8");
  assert.match(create, /googleSheetConnections/, "the existing-connection check must run before creating");
  const connectionCheck = create.indexOf("from(googleSheetConnections)");
  const lifecycleCall = create.indexOf("createGoogleSheetForSet(");
  assert.ok(connectionCheck > 0, "the existing googleSheetConnections check must exist");
  assert.ok(lifecycleCall > connectionCheck, "the duplicate check must run before any spreadsheet is created");
  assert.match(create, /alreadyConnected: true/, "the reused connection is reported as alreadyConnected");
});

// ---------------------------------------------------------- E: not configured
test("E. OAuth not configured is a clear, non-technical configuration error", () => {
  const outcome = createSheetErrorOutcome(new GoogleSheetsError("raw internal detail", "NOT_CONFIGURED", { retryable: false }), 5);
  assert.equal(outcome.kind, "configuration_required");
  assert.equal(outcome.status, 501);
  assert.equal(outcome.body.error, "Google OAuth chưa được cấu hình trên máy chủ.");
  assert.equal(outcome.body.retryable, false);
  assert.ok(!String(outcome.body.error).includes("raw internal detail"), "raw internal messages must not reach the UI");
});

// ------------------------------------------------------- revoked / permission
test("a revoked or denied Google grant sends the admin back through OAuth", () => {
  for (const code of ["OAUTH_REVOKED", "PERMISSION_DENIED"] as const) {
    const outcome = createSheetErrorOutcome(new GoogleSheetsError("raw google text", code, { retryable: false, status: 403 }), 9);
    assert.equal(outcome.kind, "need_oauth", code);
    assert.equal(outcome.status, 202, code);
    assert.equal(outcome.body.oauthRequired, true, code);
    assert.equal(outcome.body.setId, 9, code);
  }
});

test("user-facing messages never expose raw technical errors", () => {
  const outcome = createSheetErrorOutcome(new GoogleSheetsError("Invalid value at 'properties.title'", "UNKNOWN", { retryable: true }), 3);
  assert.equal(outcome.status, 502);
  assert.ok(!String(outcome.body.error).includes("properties.title"));
  assert.equal(outcome.body.retryable, true);
});

test("a transient failure stays retryable and never leaks a token", () => {
  const outcome = createSheetErrorOutcome(new GoogleSheetsError("socket hang up", "NETWORK"), 3);
  assert.equal(outcome.status, 502);
  assert.equal(outcome.body.retryable, true);
  assert.equal(outcome.body.error, "Mạng hoặc Google đang chậm. Vui lòng thử lại.");
  const serialized = JSON.stringify(outcome.body);
  assert.ok(!/ya29\.|refresh_token|client_secret/i.test(serialized), "no credential may appear in the response body");
});

// ---------------------------------------------------------- A: already connected
test("A. already connected: the flow continues to the spreadsheet instead of OAuth", () => {
  const create = readFileSync("src/app/api/admin/google-sheets/create/route.ts", "utf8");
  // The OAuth gate is only reached when there is no connection yet.
  const existingCheck = create.indexOf("if (existing)");
  const oauthGate = create.indexOf("isGoogleOAuthConfigured()");
  assert.ok(existingCheck > 0 && oauthGate > existingCheck, "the existing-connection short circuit must come first");
  assert.match(create, /alreadyConnected: true \}, \{ status: 200 \}\)/, "an existing connection answers 200 with the existing metadata");
});

// ---------------------------------------------------------- F: authorization
test("F. session and admin authorization are still enforced on the create flow", () => {
  const create = readFileSync("src/app/api/admin/google-sheets/create/route.ts", "utf8");
  const start = readFileSync("src/app/api/admin/google-sheets/oauth/start/route.ts", "utf8");
  const callback = readFileSync("src/app/api/admin/google-sheets/oauth/callback/route.ts", "utf8");
  assert.match(create, /requireAdminPermission\("google_sheets\.manage"\)/);
  assert.match(create, /requireAdminResourceAccess/);
  assert.match(start, /requireAdminPermission\("google_sheets\.manage"\)/);
  assert.match(callback, /getSession\(\)/);
  assert.match(callback, /can\("google_sheets\.manage"\)/);
});

test("the OAuth start endpoint validates the continuation it is given", () => {
  const start = readFileSync("src/app/api/admin/google-sheets/oauth/start/route.ts", "utf8");
  assert.match(start, /isLocalNext/, "the next parameter must be restricted to same-site paths");
  assert.ok(!start.includes("client_secret"), "the client secret must never reach the browser");
});
