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

test("webhook validates channel state, then syncs the notified connection", () => {
  const source = readFileSync("src/app/api/webhooks/google-drive/route.ts", "utf8");
  assert.match(source, /recordNotificationState/, "duplicate/out-of-order notifications must be filtered");
  assert.match(source, /isValidWebhookToken/, "channel token must be verified");
  assert.match(source, /202/, "webhook must answer 202 whether or not the sync succeeded");
  assert.match(source, /markSyncPending\(connection\.id, "webhook"\)/, "pending state must be persisted before syncing, so a crash is recoverable");
  assert.match(source, /runPendingConnection/, "the webhook runs the sync itself, which is what keeps sync near-real-time without a high-frequency cron");
  assert.ok(!source.includes("syncConnection"), "the webhook must go through the shared lock-guarded helper, not sync a connection directly");
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

test("the single cron route reuses the existing constant-time cron authorization", () => {
  const source = readFileSync("src/app/api/cron/google-sheets/reconcile/route.ts", "utf8");
  assert.match(source, /isValidCronAuthorization/, "cron auth must be constant-time");
  assert.match(source, /CRON_SECRET/);
  assert.match(source, /reconcilePendingGoogleSheets/, "the cron drains the DB-backed pending queue");
  assert.match(source, /renewGoogleWatchChannels/, "the cron also renews expiring watch channels, since Hobby allows only one daily cron");
});

test("vercel cron schedules stay within the Hobby once-per-day limit", () => {
  const config = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: Array<{ path: string; schedule: string }> };
  for (const cron of config.crons) {
    const fields = cron.schedule.trim().split(/\s+/);
    assert.equal(fields.length, 5, `${cron.path} must use a 5-field cron expression`);
    const [minute, hour] = fields;
    if (minute === "*" || hour === "*") throw new Error(`${cron.path} runs more than once per day, which Vercel Hobby rejects: ${cron.schedule}`);
    assert.doesNotMatch(cron.schedule, /^\*\/\d+/, `${cron.path} uses a step schedule, which Vercel Hobby rejects: ${cron.schedule}`);
  }
  const googleSheetCrons = config.crons.filter((cron) => cron.path.startsWith("/api/cron/google-sheets"));
  assert.equal(googleSheetCrons.length, 1, "Google Sheets sync must have exactly one cron entry (reconcile + renewal combined)");
});

test("middleware whitelists the Google Sheets cron path for Vercel Cron", () => {
  const source = readFileSync("src/middleware.ts", "utf8");
  assert.match(source, /GOOGLE_SHEETS_CRON_PATHS/);
  for (const path of ["/api/cron/google-sheets/reconcile"]) {
    assert.ok(source.includes(path), `middleware must whitelist ${path}`);
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

