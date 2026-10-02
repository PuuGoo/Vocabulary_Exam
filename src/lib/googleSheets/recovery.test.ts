import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  connectionView, connectionViewMessage, isActiveConnectionState, isBrokenConnectionState, isPausedConnectionState,
} from "@/lib/googleSheets/recoveryState";

/**
 * Regression suite for the "Create Google Sheet returns 409 while the UI says
 * Chưa kết nối" bug.
 *
 * Root cause (verified against the previous implementation):
 *  - createGoogleSheetForSet() threw a 409 for *any* googleSheetConnections row,
 *    including status=error / enabled=false / disconnected / orphaned rows left
 *    behind when the spreadsheet was created but the DB wiring failed;
 *  - the admin panel derived "Chưa kết nối" from a connection object that the
 *    GET endpoint did return - so the backend and the UI disagreed about the
 *    very same row.
 *
 * The fix introduces a single state mapper (connectionView) used by both the
 * create route and the UI, and a recovery flow that heals the existing
 * spreadsheet instead of 409-ing or creating a duplicate.
 */

// ------------------------------------------------- state mapping (UI vs API)
test("H. a single view function maps every connection state for UI and API", () => {
  assert.equal(connectionView(null), "none");
  assert.equal(connectionView({ enabled: true, status: "connected" }), "connected");
  assert.equal(connectionView({ enabled: true, status: "syncing" }), "connected");
  assert.equal(connectionView({ enabled: false, status: "paused" }), "paused");
  assert.equal(connectionView({ enabled: false, status: "connected" }), "paused");
  assert.equal(connectionView({ enabled: false, status: "error" }), "error");
  assert.equal(connectionView({ enabled: false, status: "disconnected" }), "disconnected");
  // The old bug: error + enabled=false was rendered as "not connected" by the
  // panel while the API returned 409. Both must now agree it is an error state.
  assert.equal(connectionView({ enabled: false, status: "error" }), "error");
  assert.notEqual(connectionView({ enabled: false, status: "error" }), "none");
});

test("H. view messages are actionable Vietnamese, never raw technical errors", () => {
  assert.match(connectionViewMessage("connected"), /tồn tại và đang kết nối/);
  assert.match(connectionViewMessage("paused"), /tạm dừng/);
  assert.match(connectionViewMessage("error"), /khôi phục/);
  assert.match(connectionViewMessage("disconnected"), /kết nối lại/);
  for (const view of ["connected", "paused", "error", "disconnected", "none"] as const) {
    const message = connectionViewMessage(view);
    assert.ok(!/undefined|\[object|ECONN|42P01|SELECT/i.test(message), view);
  }
});

test("state helpers classify error/disconnected as broken, not merely inactive", () => {
  assert.equal(isActiveConnectionState({ enabled: true, status: "connected" }), true);
  assert.equal(isActiveConnectionState({ enabled: true, status: "error" }), false);
  assert.equal(isPausedConnectionState({ enabled: false, status: "paused" }), true);
  assert.equal(isPausedConnectionState({ enabled: false, status: "error" }), false, "an error must never look merely paused");
  assert.equal(isBrokenConnectionState({ enabled: false, status: "error" }), true);
  assert.equal(isBrokenConnectionState({ enabled: false, status: "disconnected" }), true);
  assert.equal(isBrokenConnectionState({ enabled: false, status: "paused" }), false);
});

// --------------------------------------------- create route: no more blanket 409
test("B/C/D/E. the create route no longer answers a blanket 409 for any existing row", () => {
  const route = readFileSync("src/app/api/admin/google-sheets/create/route.ts", "utf8");
  assert.ok(!route.includes("Bộ từ vựng này đã kết nối Google Sheet."), "the old blanket-409 message must be gone");
  // The route must branch by state before doing anything else.
  assert.match(route, /loadConnectionForSet\(setId\)/, "the connection must be loaded first");
  assert.match(route, /connectionView\(existing\)/, "the shared view mapper decides the outcome");
  assert.match(route, /recoverGoogleSheetConnection\(/, "a broken connection is recovered, not rejected");
  // Order matters: load the connection before calling the creator.
  const loadIdx = route.indexOf("loadConnectionForSet(setId)");
  const createIdx = route.indexOf("createGoogleSheetForSet(");
  assert.ok(loadIdx > 0 && createIdx > loadIdx, "state check must run before any spreadsheet creation");
});

test("B. a healthy connection is an idempotent 200, never a new spreadsheet", () => {
  const route = readFileSync("src/app/api/admin/google-sheets/create/route.ts", "utf8");
  assert.match(route, /alreadyConnected: true/, "the existing connection is returned");
  assert.match(route, /status: 200/, "and it is a 200, not a 409 conflict");
  // The healthy branch returns before the recover + create calls.
  const healthyIdx = route.indexOf('view === "connected" || view === "paused"');
  const recoverIdx = route.indexOf("recoverGoogleSheetConnection(");
  const createIdx = route.indexOf("createGoogleSheetForSet(");
  assert.ok(healthyIdx > 0 && recoverIdx > healthyIdx && createIdx > healthyIdx, "healthy short-circuits first");
});

test("C/D/E. error, disabled and disconnected connections all route to recovery", () => {
  const route = readFileSync("src/app/api/admin/google-sheets/create/route.ts", "utf8");
  // No per-status 409 guard exists for the broken states; they all fall into the
  // same recover block guarded only by view !== connected/paused.
  assert.match(route, /view === "connected" \|\| view === "paused"/);
  assert.ok(!/status === "error"[^\n]*status: 409/.test(route), "error state must not map to 409");
  assert.ok(route.includes("recoverGoogleSheetConnection(existing.id"), "broken states call recovery");
});

test("F. a spreadsheet that is verifiably gone allows a fresh one, exactly once", () => {
  const route = readFileSync("src/app/api/admin/google-sheets/create/route.ts", "utf8");
  // Only SHEET_NOT_FOUND may drop the stale row and fall through to create.
  assert.match(route, /error\.code === "SHEET_NOT_FOUND"/);
  assert.match(route, /db\.delete\(googleSheetConnections\)\.where\(eq\(googleSheetConnections\.id, existing\.id\)\)/);
  // The delete happens inside the recover catch, i.e. only after access failed.
  const recoverIdx = route.indexOf("recoverGoogleSheetConnection(existing.id");
  const deleteIdx = route.indexOf("db.delete(googleSheetConnections)");
  assert.ok(recoverIdx > 0 && deleteIdx > recoverIdx, "recovery is attempted before any destructive cleanup");
});

test("G. concurrent create requests are serialized by an advisory create lock", () => {
  const lifecycle = readFileSync("src/lib/googleSheets/sheetLifecycle.ts", "utf8");
  assert.match(lifecycle, /acquireCreateLock\(setId\)/, "the lock is acquired before creating");
  assert.match(lifecycle, /releaseCreateLock\(setId\)/, "the lock is released on success and failure");
  assert.match(lifecycle, /finally\s*\{\s*await releaseCreateLock/, "release happens in finally");
  // The lock lives in the existing lock table, keyed by setId with a create owner.
  assert.match(lifecycle, /create:\$\{setId\}/);
  assert.match(lifecycle, /CREATE_LOCK_TTL_MS/, "a crashed process must not hold the lock forever");
});

test("G. the database backstop enforces one connection row per set", () => {
  const migration = readFileSync("drizzle/0035_google_sheet_connections_unique_set.sql", "utf8");
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS google_sheet_connections_set_unique/);
  assert.match(migration, /GROUP BY set_id\s+HAVING COUNT\(\*\) > 1/, "duplicates are reconciled first");
  assert.match(migration, /status = 'connected' AND enabled/, "the healthy row survives reconciliation");
  assert.match(migration, /ON DELETE CASCADE/, "dependent rows follow the loser without touching the winner");
  // Additive: never drops or recreates the table.
  assert.ok(!/DROP TABLE|ALTER TABLE\s+\w+\s+DROP COLUMN/i.test(migration), "the migration must be additive");

  const schema = readFileSync("src/db/schema.ts", "utf8");
  assert.match(schema, /uniqueIndex\("google_sheet_connections_set_unique"\)\.on\(table\.setId\)/);
});

// ------------------------------------------------------- create lifecycle 409s
test("the lifecycle distinguishes healthy vs broken connections instead of a blanket 409", () => {
  const lifecycle = readFileSync("src/lib/googleSheets/sheetLifecycle.ts", "utf8");
  assert.match(lifecycle, /CONNECTED_MESSAGE/, "healthy connection message");
  assert.match(lifecycle, /RECOVER_MESSAGE/, "recoverable connection message");
  assert.ok(!lifecycle.includes("Bộ từ vựng này đã kết nối Google Sheet."), "old blanket message removed");
  assert.match(lifecycle, /export const CONNECTED_MESSAGE = "[^"]+"/);
  assert.match(lifecycle, /export const RECOVER_MESSAGE = "[^"]+"/);
  assert.match(lifecycle, /export const CREATE_BUSY_MESSAGE = "[^"]+"/);
});

// ------------------------------------------------------------ recover endpoint
test("the recover endpoint exists, is authorized and never creates a spreadsheet", () => {
  const recover = readFileSync("src/app/api/admin/google-sheets/connections/[id]/recover/route.ts", "utf8");
  assert.match(recover, /requireAdminPermission\("google_sheets\.manage"\)/);
  assert.match(recover, /requireAdminResourceAccess/);
  assert.match(recover, /recoverGoogleSheetConnection\(connectionId/);
  assert.ok(!recover.includes("createSpreadsheet"), "recovery must never create a spreadsheet");
  assert.match(recover, /checkRateLimit/, "manual recovery is rate-limited");
  // OAuth problems are handed to the onboarding flow, not a bare 401.
  assert.match(recover, /oauthRequired: true/);
});

test("recovery verifies access, repairs mappings/channel, re-enables and syncs - and never duplicates", () => {
  const recovery = readFileSync("src/lib/googleSheets/recovery.ts", "utf8");
  assert.match(recovery, /verifyAccess\(connection\.spreadsheetId\)/, "step 1: verify the existing spreadsheet");
  assert.match(recovery, /getSpreadsheetMetadata\(connection\.spreadsheetId\)/, "step 2: refresh sheet/tab metadata");
  assert.match(recovery, /googleSheetRowMappings/, "step 3: repair row mappings");
  assert.match(recovery, /ensureWatchChannel\(/, "step 4: repair the Drive watch channel");
  assert.match(recovery, /enabled: true,\s*\n\s*status: "connected"/, "step 5: re-enable + connected");
  assert.match(recovery, /syncConnection\(connectionId, "initial"/, "step 6: converge with one sync");
  assert.ok(!recovery.includes("createSpreadsheet"), "recovery must never spawn a second spreadsheet");
  // The row is never deleted by recovery itself: spreadsheetId/mappings survive.
  assert.ok(!/db\.delete\(googleSheetConnections\)/.test(recovery), "recovery must not delete the connection");
});

test("a genuinely gone spreadsheet surfaces SHEET_NOT_FOUND so a new one may be offered", () => {
  const recovery = readFileSync("src/lib/googleSheets/recovery.ts", "utf8");
  assert.match(recovery, /new GoogleSheetsError\("Không thể truy cập Google Sheet cũ\. Bạn có thể tạo Sheet mới\.", "SHEET_NOT_FOUND"/);
  assert.match(recovery, /status: "error", enabled: false/, "the unusable row is marked, not silently kept 'connected'");
});

// ---------------------------------------------------------------- UI agreement
test("H. the panel renders an explicit error state with recovery actions", () => {
  const panel = readFileSync("src/components/GoogleSheetsPanel.tsx", "utf8");
  assert.match(panel, /connection\.status === "error" \|\| connection\.status === "disconnected"/, "broken states get their own branch");
  assert.match(panel, /Khôi phục kết nối/, "the recovery button exists");
  assert.match(panel, /recoverConnection\(/, "the button calls the recover endpoint");
  assert.match(panel, /connections\/\$\{connection\.id\}\/recover/);
  // "not connected" must only render when there is genuinely no connection.
  assert.match(panel, /\{!connection && \(/, "Chưa kết nối only when no row exists");
  assert.ok(!panel.includes("Google Sheet: Chưa kết nối") || panel.includes("!connection"), "the label must be gated on !connection");
  // A fresh sheet may only be offered after the old one proved gone.
  assert.match(panel, /setCanCreateNew\(true\)/);
  assert.match(panel, /data\.spreadsheetGone/);
});

test("H. the panel understands alreadyConnected / recovered create responses", () => {
  const panel = readFileSync("src/components/GoogleSheetsPanel.tsx", "utf8");
  assert.match(panel, /data\.alreadyConnected && !data\.recovered/, "idempotent reuse");
  assert.match(panel, /data\.recovered/, "recovery result");
});

// ------------------------------------------------- preserve existing behavior
test("I. manual Sync Now still uses the shared syncConnection", () => {
  const sync = readFileSync("src/app/api/admin/google-sheets/connections/[id]/sync/route.ts", "utf8");
  assert.match(sync, /syncConnection\(connectionId, "manual"/);
  assert.match(sync, /requireAdminPermission\("google_sheets\.sync"\)/);
});

test("J. webhook sync still goes through the same shared sync path", () => {
  const webhook = readFileSync("src/app/api/webhooks/google-drive/route.ts", "utf8");
  assert.match(webhook, /runPendingConnection\(connection\.id, "webhook"\)/);
  assert.match(webhook, /verifyChannelToken/, "channel token auth from the previous fix is preserved");
});

test("recovery never leaks raw Google errors to the admin", () => {
  const recover = readFileSync("src/app/api/admin/google-sheets/connections/[id]/recover/route.ts", "utf8");
  assert.match(recover, /Khôi phục Google Sheet thất bại\. Vui lòng thử lại\./);
  assert.ok(!recover.includes("error.message}"), "raw messages are logged, not echoed");
});