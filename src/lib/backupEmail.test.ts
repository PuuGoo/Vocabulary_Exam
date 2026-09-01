import assert from "node:assert/strict";
import test from "node:test";
import { backupAttachmentError, MAX_EMAIL_ATTACHMENT_BYTES } from "./backupEmailAttachment";
import type { BackupEmailResult } from "./backupEmail";
import { isValidCronAuthorization, runScheduledBackup, type ScheduledBackupDependencies } from "./backupEmailCron";
import { getEmailConfigStatus, safeSmtpError } from "./mailer";

const schedule = { enabled: true, recipient: "backup@example.com", hour: 0, timezone: "Asia/Ho_Chi_Minh", lastSentDate: "", lastSentAt: "", lastError: "", lastCronAt: "", lastAttemptAt: "", lastAttemptStatus: "" };
function fixture(overrides: Partial<ScheduledBackupDependencies> = {}) {
  const events: string[] = [];
  const deps: ScheduledBackupDependencies = { now: new Date("2026-09-01T17:00:00Z"), getSchedule: async () => schedule, heartbeat: async () => { events.push("heartbeat"); }, alreadySent: async () => false, configured: () => true, claim: async () => { events.push("claim"); return true; }, release: async () => { events.push("release"); }, attempt: async (_at, status) => { events.push(status); }, result: async (_date, sentAt) => { events.push(sentAt ? "sent" : "failed"); }, send: async () => ({ ok: true, filename: "backup.json.gz", compressedBytes: 1, originalBytes: 2 }), ...overrides };
  return { deps, events };
}

test("disabled schedule records heartbeat without sending", async () => { let sent = false; const { deps, events } = fixture({ getSchedule: async () => ({ ...schedule, enabled: false }), send: async () => { sent = true; throw new Error(); } }); assert.equal((await runScheduledBackup(deps)).skipped, "disabled"); assert.deepEqual(events, ["heartbeat"]); assert.equal(sent, false); });
test("enabled schedule sends correct recipient then marks success", async () => { let recipient = ""; const { deps, events } = fixture({ send: async (to) => { recipient = to; return { ok: true, filename: "x.gz", compressedBytes: 1, originalBytes: 2 }; } }); assert.equal((await runScheduledBackup(deps)).ok, true); assert.equal(recipient, schedule.recipient); assert.deepEqual(events, ["heartbeat", "claim", "running", "sent", "success"]); });
test("successful date never sends twice", async () => { let sent = false; const { deps } = fixture({ alreadySent: async () => true, send: async () => { sent = true; throw new Error(); } }); assert.equal((await runScheduledBackup(deps)).skipped, "already-sent"); assert.equal(sent, false); });
test("send failure records error and releases claim", async () => { const failure: BackupEmailResult = { ok: false, stage: "smtp", error: "SMTP failed" }; const { deps, events } = fixture({ send: async () => failure }); assert.equal((await runScheduledBackup(deps)).ok, false); assert.deepEqual(events, ["heartbeat", "claim", "running", "failed", "error", "release"]); });
test("stale running claim is released before retry", async () => { const { deps, events } = fixture({ getSchedule: async () => ({ ...schedule, lastAttemptStatus: "running", lastAttemptAt: "2026-09-01T14:00:00Z" }) }); await runScheduledBackup(deps); assert.deepEqual(events.slice(0, 3), ["heartbeat", "release", "claim"]); });
test("invalid cron authorization is rejected", () => { assert.equal(isValidCronAuthorization("Bearer correct", "wrong"), false); assert.equal(isValidCronAuthorization(null, "secret"), false); assert.equal(isValidCronAuthorization("Bearer secret", undefined), false); assert.equal(isValidCronAuthorization("Bearer secret", "secret"), true); });
test("missing SMTP and auth failure have safe actionable errors", () => { const saved = { ...process.env }; delete process.env.SMTP_HOST; delete process.env.SMTP_USER; delete process.env.SMTP_PASS; delete process.env.SMTP_FROM; assert.equal(getEmailConfigStatus().configured, false); assert.match(getEmailConfigStatus().error || "", /SMTP_HOST/); assert.match(safeSmtpError(Object.assign(new Error("bad auth"), { code: "EAUTH" })), /SMTP_USER\/SMTP_PASS/); process.env = saved; });
test("oversized attachment is rejected clearly", () => { assert.equal(backupAttachmentError(MAX_EMAIL_ATTACHMENT_BYTES), null); assert.match(backupAttachmentError(MAX_EMAIL_ATTACHMENT_BYTES + 1) || "", /18 MB/); });
