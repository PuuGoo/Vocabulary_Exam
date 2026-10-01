import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The Google Sheets Sync engine must only ever write to `words` and
 * `google_sheet_row_mappings`. If it ever touched learning tables, a Sheet edit
 * could reset progress. These assertions guard that invariant at the source
 * level, in addition to the DB-level integration test.
 */
test("sync engine never writes learning tables", () => {
  const source = readFileSync("src/lib/googleSheets/syncVocabulary.ts", "utf8");
  for (const forbidden of ["wordProgress", "mistakes", "wordSkillProgress", "userWordSkillProgress", "setReviewProgress", "userWordSkillEvents", "reviewSessions"]) {
    assert.ok(!new RegExp(`\\.update\\(${forbidden}\\)`).test(source), `sync engine must not update ${forbidden}`);
    assert.ok(!new RegExp(`\\.delete\\(${forbidden}\\)`).test(source), `sync engine must not delete ${forbidden}`);
    assert.ok(!new RegExp(`\\.insert\\(${forbidden}\\)`).test(source), `sync engine must not insert ${forbidden}`);
  }
  // It must not change the identity (primary key) of an existing word either.
  assert.ok(!/\.set\(\{[^}]*\bid:\s/.test(source), "sync engine must never reassign a word id");
  assert.ok(!/set\(\{\s*position\s*:/.test(source), "sync engine must not rewrite word positions");
});

test("delete behavior defaults to archive and never hard-deletes learning data", () => {
  const store = readFileSync("src/db/schema.ts", "utf8");
  assert.match(store, /deleteBehavior: varchar\("delete_behavior", \{ length: 16 \}\)\.notNull\(\)\.default\("archive"\)/);
  const lifecycle = readFileSync("src/lib/googleSheets/sheetLifecycle.ts", "utf8");
  assert.match(lifecycle, /deleteBehavior: "archive"/);
  assert.ok(!lifecycle.includes('deleteBehavior: "delete"'), "creating a connection must never default to hard delete");
});

test("webhook validates channel state before scheduling a sync", () => {
  const source = readFileSync("src/app/api/webhooks/google-drive/route.ts", "utf8");
  assert.match(source, /recordNotificationState/, "duplicate/out-of-order notifications must be filtered");
  assert.match(source, /isValidWebhookToken/, "channel token must be verified");
  assert.match(source, /202/, "webhook must acknowledge quickly instead of syncing inline");
  assert.ok(!source.includes("syncConnection"), "the webhook must not run a long sync inside the request");
});

test("connection-level lock guards concurrent syncs", () => {
  const source = readFileSync("src/lib/googleSheets/store.ts", "utf8");
  assert.match(source, /SyncInProgressError/);
  assert.match(source, /lockedUntil/);
  assert.match(source, /acquireConnectionLock/);
  assert.match(source, /releaseConnectionLock/);
});

test("OAuth tokens are encrypted at rest and never returned to the browser", () => {
  const crypto = readFileSync("src/lib/googleSheets/crypto.ts", "utf8");
  assert.match(crypto, /aes-256-gcm/);
  assert.match(crypto, /GOOGLE_SHEET_TOKEN_ENCRYPTION_KEY/);
  const start = readFileSync("src/app/api/admin/google-sheets/oauth/start/route.ts", "utf8");
  assert.ok(!start.includes("client_secret"), "the OAuth start redirect must not expose the client secret");
  const callback = readFileSync("src/app/api/admin/google-sheets/oauth/callback/route.ts", "utf8");
  assert.match(callback, /parseGoogleOAuthState/, "the callback must verify a signed state");
  assert.ok(!/console\.log\([^)]*token/i.test(callback), "tokens must never be logged");
});

test("admin routes require explicit Google Sheets permissions", () => {
  const create = readFileSync("src/app/api/admin/google-sheets/create/route.ts", "utf8");
  const sync = readFileSync("src/app/api/admin/google-sheets/connections/[id]/sync/route.ts", "utf8");
  const connect = readFileSync("src/app/api/admin/google-sheets/connect/route.ts", "utf8");
  assert.match(create, /requireAdminPermission\("google_sheets\.manage"\)/);
  assert.match(sync, /requireAdminPermission\("google_sheets\.sync"\)/);
  assert.match(connect, /requireAdminPermission\("google_sheets\.manage"\)/);
  for (const source of [create, sync, connect]) assert.match(source, /requireAdminResourceAccess/, "folder authorization is required");
});

test("cron routes reuse the existing constant-time cron authorization", () => {
  for (const path of ["src/app/api/cron/google-sheets/reconcile/route.ts", "src/app/api/cron/google-sheets/renew-channels/route.ts"]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /isValidCronAuthorization/, path);
    assert.match(source, /CRON_SECRET/, path);
  }
});

test("viewer admins cannot manage Google Sheets connections", async () => {
  const { resolveAdminPermissions } = await import("@/lib/adminPermissions");
  assert.equal(resolveAdminPermissions("viewer").has("google_sheets.manage"), false);
  assert.equal(resolveAdminPermissions("viewer").has("google_sheets.view"), false);
  assert.equal(resolveAdminPermissions("content_editor").has("google_sheets.manage"), true);
  assert.equal(resolveAdminPermissions("manager").has("google_sheets.sync"), true);
  assert.equal(resolveAdminPermissions("owner").has("google_sheets.manage"), true);
});

test("google sheets migration is additive and never touches the words table", () => {
  const migration = readFileSync(join("drizzle", "0033_google_sheets_sync.sql"), "utf8");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS google_sheet_connections/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS google_sheet_sync_channels/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS google_sheet_row_mappings/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS google_sheet_sync_runs/);
  assert.ok(!/ALTER TABLE words/i.test(migration), "must not alter words");
  assert.ok(!/DROP TABLE/i.test(migration), "must not drop anything");
  assert.match(migration, /UNIQUE INDEX IF NOT EXISTS google_sheet_row_mappings_source_idx ON google_sheet_row_mappings\(connection_id, source_id\)/);
});

