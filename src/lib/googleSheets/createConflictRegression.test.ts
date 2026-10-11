import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  classifyGoogleApiError,
  GoogleSheetsError,
} from "@/lib/googleSheets/errors";
import {
  connectionView,
  isBrokenConnectionState,
  isTerminalConnectionState,
} from "@/lib/googleSheets/recoveryState";
import { createSheetErrorOutcome } from "@/lib/googleSheets/createFlow";

/**
 * Production regression: POST /api/admin/google-sheets/create returned
 * HTTP 409 (Conflict), and the admin UI had previously shown
 * "INVALID_SCHEMA: invalid_grant".
 *
 * Two independent defects combined into the dead end the admin hit:
 *
 * 1. classifyGoogleApiError mapped Google OAuth refresh failures
 *    (HTTP 400 with { error: "invalid_grant" }) to INVALID_SCHEMA, so the
 *    UI reported "dữ liệu không đúng định dạng" and the create/recover
 *    flow never offered the OAuth reconnection.
 *
 * 2. Connections in archived / replaced states fell through the create
 *    route into createGoogleSheetForSet, which throws 409 for ANY existing
 *    row - so the admin could never create, reconnect, or recover.
 *
 * This suite locks the corrected behaviour for each case without touching
 * vocabulary data: no DB, no network, no tokens.
 */

// ------------------------------------------------------------- case 1: first create
test("first create (no connection row): the route skips recovery and calls the creator", () => {
  const route = readFileSync("src/app/api/admin/google-sheets/create/route.ts", "utf8");
  // The creator is guarded by the existing check, so falling past `if
  // (existing)` is the only way to reach it.
  const loadIdx = route.indexOf("loadConnectionForSet(setId)");
  const createIdx = route.indexOf("createGoogleSheetForSet(");
  assert.ok(loadIdx > 0 && createIdx > loadIdx, "state check first, creator second");
  // A brand-new create answers 201 with the connection metadata.
  assert.match(route, /\{ status: 201 \}\)/, "first create answers 201");
});

// ------------------------------------------------------------- case 2: duplicate create
test("duplicate create (healthy connection): idempotent 200, never a second spreadsheet", () => {
  const route = readFileSync("src/app/api/admin/google-sheets/create/route.ts", "utf8");
  assert.match(route, /view === "connected" \|\| view === "paused"/, "connected + paused short-circuit");
  assert.match(route, /alreadyConnected: true/, "reused connection is flagged");
  assert.match(route, /createGoogleSheetForSet\(/, "creator still exists");
  const healthyIdx = route.indexOf('view === "connected" || view === "paused"');
  const createIdx = route.indexOf("createGoogleSheetForSet(");
  assert.ok(healthyIdx < createIdx, "healthy rows return before the creator runs");

  // The unique-on-set index is the DB-level backstop for the race...
  const schema = readFileSync("src/db/schema.ts", "utf8");
  assert.match(schema, /uniqueIndex\("google_sheet_connections_set_unique"\)/, "one connection per set");
  // ...and the route survives the race by re-reading instead of 409/502.
  assert.match(route, /isUniqueViolation/, "unique-violation fallback exists");
  assert.match(route, /raced: true/, "the raced row is returned");
});

// ------------------------------------------------------------- case 3: broken connection
test("broken connection (error / disconnected / missing): recover, never 409", () => {
  assert.equal(isBrokenConnectionState({ enabled: false, status: "error" }), true);
  assert.equal(isBrokenConnectionState({ enabled: false, status: "disconnected" }), true);
  assert.equal(connectionView({ enabled: false, status: "error" }), "error");
  assert.equal(connectionView({ enabled: false, status: "disconnected" }), "disconnected");
  // Recovery must route these into the heal path, not into the 409 branches.
  const route = readFileSync("src/app/api/admin/google-sheets/create/route.ts", "utf8");
  assert.match(route, /recoverGoogleSheetConnection\(existing\.id/, "broken rows call recovery");
  const brokenOutcome = createSheetErrorOutcome(
    Object.assign(new GoogleSheetsError("x", "INVALID_SCHEMA", { retryable: false, status: 409 }), { needsRecovery: true }),
    7,
  );
  assert.equal(brokenOutcome.status, 409);
  assert.equal(brokenOutcome.body.needsRecovery, true, "if 409 survives it still points at recovery");

  // The panel routes that flag to the recovery dialog.
  const panel = readFileSync("src/components/GoogleSheetsPanel.tsx", "utf8");
  assert.match(panel, /if \(data\.needsRecovery\)/, "broken create response opens the recovery dialog");
});

// ------------------------------------------------------------- case 4: revoked/expired OAuth
test("OAuth refresh failure (invalid_grant): classified as OAUTH_REVOKED, never INVALID_SCHEMA", () => {
  // The production shape: googleapis surfaces HTTP 400 + invalid_grant.
  for (const shape of [
    { status: 400, message: "invalid_grant" },
    { status: 400, message: 'invalid_grant: "Token has been expired or revoked."' },
    { response: { status: 400, data: { error: "invalid_grant", error_description: "Token has been expired or revoked." } } },
    { error: "invalid_grant", error_description: "Token has been expired or revoked." },
    { code: 400, message: "Request failed - invalid_grant" },
    { code: "400", error: { message: "invalid_grant" } },
  ]) {
    const classified = classifyGoogleApiError(shape);
    assert.equal(classified.code, "OAUTH_REVOKED", JSON.stringify(shape));
    assert.equal(classified.retryable, false, "revocation is not retryable");
  }
  // 401 still maps to revoked as before.
  assert.equal(classifyGoogleApiError({ status: 401, message: "Unauthorized" }).code, "OAUTH_REVOKED");
  // Genuine 400s (bad request, not invalid_grant) keep the schema mapping.
  assert.equal(classifyGoogleApiError({ status: 400, message: "Invalid value at 'properties.title'" }).code, "INVALID_SCHEMA");
});

test("OAuth revocation during create/recover: structured reconnect (202 + oauthUrl), never a bare 409", () => {
  for (const code of ["OAUTH_REVOKED", "OAUTH_REQUIRED", "PERMISSION_DENIED"] as const) {
    const outcome = createSheetErrorOutcome(new GoogleSheetsError("raw google text", code, { retryable: false }), 9);
    assert.equal(outcome.kind, "need_oauth", code);
    assert.equal(outcome.status, 202, code);
    assert.equal(outcome.body.oauthRequired, true, code);
    assert.ok(String(outcome.body.oauthUrl).includes("/api/admin/google-sheets/oauth/start"), code);
    assert.equal(outcome.body.setId, 9, code);
  }
  // The recover endpoint hands the same payload so the panel can reconnect.
  const recover = readFileSync("src/app/api/admin/google-sheets/connections/[id]/recover/route.ts", "utf8");
  assert.match(recover, /oauthRequired: true/, "recover offers OAuth reconnection");
  // And the panel redirects into the existing OAuth flow.
  const panel = readFileSync("src/components/GoogleSheetsPanel.tsx", "utf8");
  assert.match(panel, /data\.oauthRequired && data\.oauthUrl/, "panel redirects to OAuth");
  assert.ok(!/ya29\.|refresh_token|client_secret/i.test(JSON.stringify(createSheetErrorOutcome(new GoogleSheetsError("invalid_grant", "OAUTH_REVOKED"), 1).body)), "no credential in the response");
});

// ------------------------------------------------------------- case 5: recover a connection
test("recovery heals the existing row: never a new spreadsheet, never deletes vocabulary", () => {
  const recovery = readFileSync("src/lib/googleSheets/recovery.ts", "utf8");
  assert.ok(!recovery.includes("createSpreadsheet"), "recovery never creates a spreadsheet");
  assert.ok(!/db\.delete\(googleSheetConnections\)/.test(recovery), "recovery never deletes the row");
  assert.match(recovery, /syncConnection\(connectionId, "initial"/, "one sync converges after recovery");
  // Vocabulary rows are only read for re-mapping, never deleted.
  assert.ok(!/db\.delete\(words\)/.test(recovery), "recovery must never delete vocabulary");
});

// ------------------------------------------------------------- terminal states
test("terminal states (archived / replaced): actionable 409 with needsCreateNew, never recovery", () => {
  assert.equal(isTerminalConnectionState({ enabled: false, status: "archived" }), true);
  assert.equal(isTerminalConnectionState({ enabled: false, status: "replaced" }), true);
  assert.equal(isBrokenConnectionState({ enabled: false, status: "archived" }), false, "terminal must not masquerade as recoverable");
  assert.equal(connectionView({ enabled: false, status: "archived" }), "archived");
  assert.equal(connectionView({ enabled: false, status: "replaced" }), "replaced");

  const route = readFileSync("src/app/api/admin/google-sheets/create/route.ts", "utf8");
  assert.match(route, /isTerminalConnectionState\(existing\)/, "the route branches terminal states");
  assert.match(route, /needsCreateNew: true/, "the response offers a new sheet");
  const terminalIdx = route.indexOf("isTerminalConnectionState(existing)");
  const recoverIdx = route.indexOf("recoverGoogleSheetConnection(existing.id");
  assert.ok(terminalIdx > 0 && terminalIdx < recoverIdx, "terminal short-circuits before recovery");

  const lifecycle = readFileSync("src/lib/googleSheets/sheetLifecycle.ts", "utf8");
  assert.match(lifecycle, /needsCreateNew = true/, "the lifecycle flags terminal rows too");

  const terminalOutcome = createSheetErrorOutcome(
    Object.assign(new GoogleSheetsError("trashed", "INVALID_SCHEMA", { retryable: false, status: 409 }), { terminal: true, needsCreateNew: true }),
    11,
  );
  assert.equal(terminalOutcome.status, 409);
  assert.equal(terminalOutcome.body.needsCreateNew, true);
  assert.equal(terminalOutcome.body.retryable, false);

  const panel = readFileSync("src/components/GoogleSheetsPanel.tsx", "utf8");
  assert.match(panel, /data\.terminal \|\| data\.needsCreateNew/, "the panel offers a new sheet for terminal states");
  const brokenCard = readFileSync("src/components/google-sheets/GoogleSheetsBrokenCard.tsx", "utf8");
  assert.match(brokenCard, /Tạo Google Sheet mới/, "the broken card keeps the new-sheet action");
});

// ------------------------------------------------------------- sync safety
test("sync direction stays google_to_lexora and create/recover never overwrite vocabulary", () => {
  const lifecycle = readFileSync("src/lib/googleSheets/sheetLifecycle.ts", "utf8");
  // AI formulas are planted only below the exported vocabulary.
  assert.match(lifecycle, /exportedRowCount \+ 2/, "formulas start after the exported rows");
  assert.match(lifecycle, /syncDirection: "google_to_lexora"/, "sync never pushes blank formulas over the DB");
  assert.ok(!/db\.delete\(words\)/.test(lifecycle), "create never deletes vocabulary");
  const recovery = readFileSync("src/lib/googleSheets/recovery.ts", "utf8");
  assert.match(recovery, /planMappingRepair/, "recovery repairs mappings, not vocabulary");
});
