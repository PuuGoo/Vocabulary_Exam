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
test("STT is display-only: it never reaches the database or the fingerprint", () => {
  const template = readFileSync("src/lib/googleSheets/template.ts", "utf8");
  assert.match(template, /STT_HEADER = "STT"/);
  assert.match(template, /STT_FIELD_KEY = "__stt"/);
  assert.match(template, /displayOnly: true/, "the STT field must be marked display-only");
  // The formula must count filled __lexora_id cells, never ROW() (which leaves
  // gaps when rows are blank or filtered).
  const helper = readFileSync("src/lib/googleSheets/template.ts", "utf8");
  assert.match(helper, /buildSttFormula/, "the STT formula must live in one place");
  assert.ok(!/ROW\(/.test(helper), "ROW()-based numbering leaves gaps after a delete");

  // Parser must never map STT into the vocabulary model.
  const parser = readFileSync("src/lib/googleSheets/parser.ts", "utf8");
  assert.match(parser, /field\.displayOnly\) return/, "the parser must skip display-only fields");
  assert.ok(!/fieldByColumn\.has\(SOURCE_ID_HEADER\)/.test(parser), "the parser must locate __lexora_id by value, not by column 0");

  // Fingerprint must not mention STT anywhere.
  const fingerprint = readFileSync("src/lib/googleSheets/fingerprint.ts", "utf8");
  assert.ok(!/STT|__stt|sheetRowNumber/i.test(fingerprint), "the fingerprint must exclude STT and row numbers");

  // The import model must not carry STT.
  const parse = readFileSync("src/lib/vocabImport/parse.ts", "utf8");
  assert.ok(!/stt/i.test(parse), "ParsedWordDraft must never carry stt");

  // Schema must never add a column just to render STT.
  const schema = readFileSync("src/db/schema.ts", "utf8");
  assert.ok(!/stt/i.test(schema), "the database must never persist STT");

  // The backend writes blank STT cells only; the formula fills them.
  const lifecycle = readFileSync("src/lib/googleSheets/sheetLifecycle.ts", "utf8");
  assert.match(lifecycle, /writeSttFormula/, "create-sheet must write the STT formula");
});

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

test("webhook authenticates the channel token, never the notification body", () => {
  const source = readFileSync("src/app/api/webhooks/google-drive/route.ts", "utf8");
  assert.match(source, /verifyChannelToken/, "the webhook must verify X-Goog-Channel-Token");
  assert.match(source, /x-goog-resource-state/, "the webhook must read the resource state header");
  assert.match(source, /resourceState === "sync"/, "a sync notification must be acknowledged without a diff");
  assert.match(source, /202/, "webhook must answer 202 whether or not the sync succeeded");
  assert.match(source, /markSyncPending\(connection\.id, "webhook"\)/, "pending state must be persisted before syncing");
  assert.match(source, /runPendingConnection/, "the webhook runs the sync itself, which is what keeps sync near-real-time without a high-frequency cron");
  assert.ok(!source.includes("syncConnection"), "the webhook must go through the shared lock-guarded helper, not sync a connection directly");
  assert.ok(!/isValidWebhookToken|HMAC\(.*body|createHmac.*body/i.test(source), "the notification body is empty for files.watch and must never be authenticated");
  assert.ok(!/req\.text\(\)/.test(source), "the webhook must not depend on the request body");
});

/**
 * Regression: the OAuth2 client must be constructed with the client id,
 * client secret and redirect URI. Without them googleapis cannot refresh an
 * expired access token and every Google call fails with HTTP 400
 * invalid_request - even though the stored refresh token is perfectly valid.
 * This surfaced as "Tạo Google Sheet" returning INVALID_SCHEMA in production.
 */
test("the Google API client carries client credentials so expired access tokens can refresh", () => {
  const client = readFileSync("src/lib/googleSheets/client.ts", "utf8");
  assert.match(client, /new google\.auth\.OAuth2\(\{/, "OAuth2 must be constructed with config, not empty");
  assert.match(client, /clientId: process\.env\.GOOGLE_CLIENT_ID/);
  assert.match(client, /clientSecret: process\.env\.GOOGLE_CLIENT_SECRET/);
  assert.match(client, /redirectUri: process\.env\.GOOGLE_REDIRECT_URI/);
  assert.match(client, /refresh_token: token\.refreshToken/, "the stored refresh token is passed through");
});
test("watch channels send a real channel token and store only its digest", () => {
  const client = readFileSync("src/lib/googleSheets/client.ts", "utf8");
  assert.match(client, /token: channelToken/, "files.watch must send a channel token");
  // resourceUri may be *read back* from the Google response (that is a real
  // Channel field and is kept for diagnostics), but it must never be sent in
  // the files.watch request body — it is not a valid request field.
  const watchBody = /requestBody:\s*\{[\s\S]*?\}/.exec(client)?.[0] ?? "";
  assert.ok(watchBody, "the watch request body must exist");
  assert.ok(!watchBody.includes("resourceUri"), "resourceUri is not a valid Channel field for files.watch");
  // The lifetime lives in one place so client, fake and tests cannot drift.
  const api = readFileSync("src/lib/googleSheets/api.ts", "utf8");
  assert.match(api, /WATCH_CHANNEL_EXPIRATION_MS = 1000 \* 60 \* 60 \* 23/, "channel lifetime must approach the ~24h Drive cap");
  assert.match(client, /import \{ WATCH_CHANNEL_EXPIRATION_MS \} from "@\/lib\/googleSheets\/api"/, "the client must reuse the shared lifetime");

  const token = readFileSync("src/lib/googleSheets/channelToken.ts", "utf8");
  assert.match(token, /randomBytes\(32\)/, "the token must be cryptographically random");
  assert.ok(!/access_token|refresh_token|client_secret/i.test(token), "the channel token must never carry OAuth material");

  const watch = readFileSync("src/lib/googleSheets/watch.ts", "utf8");
  assert.match(watch, /hashChannelToken\(/, "only a digest may be persisted");
  // The renewal threshold is shared between the cron sweep and the lazy
  // webhook renewal, so both agree on when a channel is close to expiring.
  assert.match(watch, /WATCH_CHANNEL_RENEW_THRESHOLD_MS/, "renewal must use the shared threshold");
  assert.ok(!/channelToken: /.test(watch), "the raw token must never be written to the database");

  const schema = readFileSync("src/db/schema.ts", "utf8");
  assert.match(schema, /channelTokenHash/, "the channel table must store the digest");
  assert.ok(!/channel_token[^_]*text/i.test(schema), "the raw token must never have a plaintext column");

  const webhook = readFileSync("src/app/api/webhooks/google-drive/route.ts", "utf8");
  assert.ok(!/console\.(log|warn|error)[^\n]*channelToken/i.test(webhook), "the webhook must never log the channel token");
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

