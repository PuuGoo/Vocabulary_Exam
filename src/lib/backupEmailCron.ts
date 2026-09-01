import type { BackupEmailResult } from "@/lib/backupEmail";
import type { BackupEmailSchedule } from "@/lib/backupSchedule";
import { isStaleBackupAttempt, zonedScheduleParts } from "@/lib/backupScheduleTime";

export function isValidCronAuthorization(authorization: string | null, secret: string | undefined) {
  return Boolean(secret) && authorization === `Bearer ${secret}`;
}

export type ScheduledBackupDependencies = {
  now: Date;
  getSchedule(): Promise<BackupEmailSchedule>;
  heartbeat(at: Date): Promise<void>;
  alreadySent(date: string): Promise<boolean>;
  configured(): boolean;
  claim(date: string): Promise<boolean>;
  release(date: string): Promise<void>;
  attempt(at: Date, status: "running" | "success" | "error"): Promise<void>;
  result(date: string, sentAt: Date | null, error?: string): Promise<void>;
  send(recipient: string): Promise<BackupEmailResult>;
};

export async function runScheduledBackup(deps: ScheduledBackupDependencies) {
  await deps.heartbeat(deps.now);
  console.log("[backup-cron] heartbeat recorded");
  const schedule = await deps.getSchedule();
  console.log("[backup-cron] schedule loaded", { enabled: schedule.enabled, recipientConfigured: Boolean(schedule.recipient) });
  if (!schedule.enabled || !schedule.recipient) return { ok: true as const, skipped: "disabled" };
  const local = zonedScheduleParts(deps.now, schedule.timezone);
  if (await deps.alreadySent(local.date)) return { ok: true as const, skipped: "already-sent" };
  if (!deps.configured()) {
    const error = "SMTP chưa được cấu hình đầy đủ.";
    await Promise.all([deps.result(local.date, null, error), deps.attempt(deps.now, "error")]);
    return { ok: false as const, error, status: 503 };
  }
  if (isStaleBackupAttempt(schedule.lastAttemptAt, schedule.lastAttemptStatus, deps.now)) await deps.release(local.date);
  if (!await deps.claim(local.date)) return { ok: true as const, skipped: "already-claimed" };
  console.log("[backup-cron] claim acquired");
  await deps.attempt(deps.now, "running");
  try {
    const sent = await deps.send(schedule.recipient);
    if (!sent.ok) {
      console.error("[backup-cron] send failed", { stage: sent.stage, error: sent.error });
      await Promise.all([deps.result(local.date, null, sent.error), deps.attempt(new Date(), "error")]);
      await deps.release(local.date);
      return { ok: false as const, error: sent.error, stage: sent.stage, status: 502 };
    }
    const sentAt = new Date();
    await Promise.all([deps.result(local.date, sentAt), deps.attempt(sentAt, "success")]);
    console.log("[backup-cron] success");
    return { ok: true as const, sentAt: sentAt.toISOString(), recipient: schedule.recipient };
  } catch (cause) {
    console.error("Scheduled backup failed:", cause instanceof Error ? cause.message : cause);
    const error = "Tiến trình sao lưu gặp lỗi bất ngờ. Hãy kiểm tra log function trên Vercel.";
    await Promise.all([deps.result(local.date, null, error), deps.attempt(new Date(), "error")]);
    await deps.release(local.date);
    return { ok: false as const, error, status: 500 };
  }
}
