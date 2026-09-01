import assert from "node:assert/strict";
import test from "node:test";
import type { BackupEmailResult } from "./backupEmail";
import { isValidCronAuthorization, runScheduledBackup, type ScheduledBackupDependencies } from "./backupEmailCron";
import { buildBackupLinkMessage, getEmailConfigStatus, safeSmtpError } from "./mailer";
import { cleanupOldBackups, assertBackupPathname, signedGetOptions } from "./backupStorage";
import { BACKUP_COLLECTIONS, parseBackupDocument } from "./backup";
import { gunzipSync } from "node:zlib";
import { randomBytes } from "node:crypto";

const schedule = { enabled: true, recipient: "backup@example.com", hour: 0, timezone: "Asia/Ho_Chi_Minh", lastSentDate: "", lastSentAt: "", lastError: "", lastCronAt: "", lastAttemptAt: "", lastAttemptStatus: "" };
function fixture(overrides: Partial<ScheduledBackupDependencies> = {}) {
  const events: string[] = [];
  const deps: ScheduledBackupDependencies = { now: new Date("2026-09-01T17:00:00Z"), getSchedule: async () => schedule, heartbeat: async () => { events.push("heartbeat"); }, alreadySent: async () => false, configured: () => true, claim: async () => { events.push("claim"); return true; }, release: async () => { events.push("release"); }, attempt: async (_at, status) => { events.push(status); }, result: async (_date, sentAt) => { events.push(sentAt ? "sent" : "failed"); }, send: async () => ({ ok: true, filename: "backup.json.gz", pathname: "backups/2026/09/backup.json.gz", compressedBytes: 1, originalBytes: 2, checksum: "a".repeat(64), expiresAt: new Date().toISOString() }), ...overrides };
  return { deps, events };
}

test("disabled schedule records heartbeat without sending", async () => { let sent = false; const { deps, events } = fixture({ getSchedule: async () => ({ ...schedule, enabled: false }), send: async () => { sent = true; throw new Error(); } }); assert.equal((await runScheduledBackup(deps)).skipped, "disabled"); assert.deepEqual(events, ["heartbeat"]); assert.equal(sent, false); });
test("enabled schedule sends correct recipient then marks success", async () => { let recipient = ""; const { deps, events } = fixture({ send: async (to) => { recipient = to; return { ok: true, filename: "x.gz", pathname: "backups/2026/09/x.gz", compressedBytes: 1, originalBytes: 2, checksum: "a".repeat(64), expiresAt: new Date().toISOString() }; } }); assert.equal((await runScheduledBackup(deps)).ok, true); assert.equal(recipient, schedule.recipient); assert.deepEqual(events, ["heartbeat", "claim", "running", "sent", "success"]); });
test("successful date never sends twice", async () => { let sent = false; const { deps } = fixture({ alreadySent: async () => true, send: async () => { sent = true; throw new Error(); } }); assert.equal((await runScheduledBackup(deps)).skipped, "already-sent"); assert.equal(sent, false); });
test("send failure records error and releases claim", async () => { const failure: BackupEmailResult = { ok: false, stage: "smtp", error: "SMTP failed" }; const { deps, events } = fixture({ send: async () => failure }); assert.equal((await runScheduledBackup(deps)).ok, false); assert.deepEqual(events, ["heartbeat", "claim", "running", "failed", "error", "release"]); });
test("stale running claim is released before retry", async () => { const { deps, events } = fixture({ getSchedule: async () => ({ ...schedule, lastAttemptStatus: "running", lastAttemptAt: "2026-09-01T14:00:00Z" }) }); await runScheduledBackup(deps); assert.deepEqual(events.slice(0, 3), ["heartbeat", "release", "claim"]); });
test("invalid cron authorization is rejected", () => { assert.equal(isValidCronAuthorization("Bearer correct", "wrong"), false); assert.equal(isValidCronAuthorization(null, "secret"), false); assert.equal(isValidCronAuthorization("Bearer secret", undefined), false); assert.equal(isValidCronAuthorization("Bearer secret", "secret"), true); });
test("missing SMTP and auth failure have safe actionable errors", () => { const saved = { ...process.env }; delete process.env.SMTP_HOST; delete process.env.SMTP_USER; delete process.env.SMTP_PASS; delete process.env.SMTP_FROM; assert.equal(getEmailConfigStatus().configured, false); assert.match(getEmailConfigStatus().error || "", /SMTP_HOST/); assert.match(safeSmtpError(Object.assign(new Error("bad auth"), { code: "EAUTH" })), /SMTP_USER\/SMTP_PASS/); process.env = saved; });
test("private backup path validation rejects paths outside backups namespace", () => {
  assert.equal(assertBackupPathname("backups/2026/09/file.json.gz"), "backups/2026/09/file.json.gz");
  assert.throws(() => assertBackupPathname("public/file.json.gz"));
  assert.throws(() => assertBackupPathname("backups/../secret.json.gz"));
});

test("signed download is private, GET-only, and scoped to one backup pathname", () => {
  const pathname = "backups/2026/09/file.json.gz";
  const options = signedGetOptions(pathname, Date.now() + 60_000);
  assert.deepEqual(options.token.operations, ["get"]); assert.equal(options.token.pathname, pathname);
  assert.equal(options.url.operation, "get"); assert.equal(options.url.access, "private"); assert.equal(options.url.pathname, pathname);
});

test("backup SMTP message contains signed link and no attachment", () => {
  const message = buildBackupLinkMessage({ to: "admin@example.com", filename: "backup.json.gz", downloadUrl: "https://private.example/file?signature=x", createdAt: new Date("2026-09-01T00:00:00Z"), recordCount: 2, compressedBytes: 27_000_000, checksum: "a".repeat(64), expiresAt: new Date("2026-09-08T00:00:00Z") });
  assert.match(message.html, /signature=x/); assert.equal("attachments" in message, false);
});

test("retention deletes expired backups but never the newest backup", async () => {
  const removed: string[] = [];
  const newest = "backups/2026/09/new.json.gz";
  const expired = "backups/2026/08/old.json.gz";
  const result = await cleanupOldBackups(newest, new Date("2026-09-20T00:00:00Z"), 14, {
    listAll: async () => [
      { pathname: newest, filename: "new.json.gz", size: 1, uploadedAt: "2026-08-01T00:00:00Z", etag: "new" },
      { pathname: expired, filename: "old.json.gz", size: 1, uploadedAt: "2026-08-01T00:00:00Z", etag: "old" },
      { pathname: "backups/2026/09/recent.json.gz", filename: "recent.json.gz", size: 1, uploadedAt: "2026-09-15T00:00:00Z", etag: "recent" },
    ],
    remove: async (paths) => { removed.push(...paths); },
  });
  assert.deepEqual(result, [expired]); assert.deepEqual(removed, [expired]);
});

async function pipelineFixture(overrides: Record<string, unknown> = {}, large = false) {
  process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";
  const { storeAndSendBackupLink } = await import("./backupEmail");
  const data = Object.fromEntries(BACKUP_COLLECTIONS.map((name) => [name, []]));
  const body = JSON.stringify({ format: "lexora-backup", version: 1, createdAt: "2026-09-01T00:00:00Z", data, ...(large ? { padding: randomBytes(27 * 1024 * 1024).toString("base64") } : {}) });
  let uploaded = Buffer.alloc(0); let mail: Record<string, unknown> | undefined;
  const dependencies = {
    upload: async ({ buffer }: { buffer: Buffer }) => { uploaded = buffer; return { pathname: "backups/2026/09/test.json.gz", size: buffer.byteLength, uploadedAt: new Date(), etag: "etag" }; },
    sign: async () => "https://private.blob.vercel-storage.com/test?signature=temporary",
    send: async (input: Record<string, unknown>) => { mail = input; return { ok: true }; },
    cleanup: async () => undefined,
    now: () => new Date("2026-09-01T00:00:00Z"),
    ...overrides,
  };
  const result = await storeAndSendBackupLink("admin@example.com", { body, counts: Object.fromEntries(BACKUP_COLLECTIONS.map((name) => [name, 0])), createdAt: new Date("2026-09-01T00:00:00Z"), filename: "test.json", byteLength: Buffer.byteLength(body) }, { dependencies: dependencies as never });
  return { result, uploaded, mail };
}

test("26.5 MB+ compressed backup uploads, signs GET link, and emails no attachment", async () => {
  const { result, uploaded, mail } = await pipelineFixture({}, true);
  assert.equal(result.ok, true); assert.ok(uploaded.byteLength > 26.5 * 1024 * 1024);
  assert.equal("attachment" in (mail || {}), false); assert.equal("attachments" in (mail || {}), false);
  assert.match(String(mail?.downloadUrl), /^https:\/\/private\./);
  assert.equal(parseBackupDocument(JSON.parse(gunzipSync(uploaded).toString("utf8"))).format, "lexora-backup");
});

test("Blob upload failure stops before signed URL and Gmail", async () => {
  let signed = false; let mailed = false;
  const { result } = await pipelineFixture({ upload: async () => { throw new Error("blob unavailable"); }, sign: async () => { signed = true; return ""; }, send: async () => { mailed = true; return { ok: true }; } });
  assert.deepEqual(result.ok ? null : result.stage, "storage"); assert.equal(signed, false); assert.equal(mailed, false);
});

test("signed URL failure reports signed-url and does not send Gmail", async () => {
  let mailed = false; const { result } = await pipelineFixture({ sign: async () => { throw new Error("sign failed"); }, send: async () => { mailed = true; return { ok: true }; } });
  assert.deepEqual(result.ok ? null : result.stage, "signed-url"); assert.equal(mailed, false);
});

test("SMTP failure keeps uploaded Blob and cleanup failure is non-fatal", async () => {
  let uploaded = false; const { result } = await pipelineFixture({ upload: async ({ buffer }: { buffer: Buffer }) => { uploaded = true; return { pathname: "backups/2026/09/test.json.gz", size: buffer.byteLength, uploadedAt: new Date(), etag: "etag" }; }, cleanup: async () => { throw new Error("cleanup unavailable"); }, send: async () => ({ ok: false, error: "SMTP failed" }) });
  assert.equal(uploaded, true); assert.deepEqual(result.ok ? null : result.stage, "smtp");
});
