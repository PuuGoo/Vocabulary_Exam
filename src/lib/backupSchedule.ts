import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";

export const BACKUP_SCHEDULE_KEYS = {
  enabled: "backup_email_enabled",
  recipient: "backup_email_recipient",
  hour: "backup_email_hour",
  timezone: "backup_email_timezone",
  lastSentDate: "backup_email_last_sent_date",
  lastSentAt: "backup_email_last_sent_at",
  lastError: "backup_email_last_error",
  lastClaimDate: "backup_email_last_claim_date",
} as const;

export type BackupEmailSchedule = {
  enabled: boolean;
  recipient: string;
  hour: number;
  timezone: string;
  lastSentDate: string;
  lastSentAt: string;
  lastError: string;
};

export async function getBackupEmailSchedule(): Promise<BackupEmailSchedule> {
  const rows = await db.select().from(appSettings);
  const values = new Map(rows.map((row) => [row.key, row.value]));
  const parsedHour = Number(values.get(BACKUP_SCHEDULE_KEYS.hour) ?? 20);
  return {
    enabled: values.get(BACKUP_SCHEDULE_KEYS.enabled) === "true",
    recipient: values.get(BACKUP_SCHEDULE_KEYS.recipient) ?? "",
    hour: Number.isInteger(parsedHour) && parsedHour >= 0 && parsedHour <= 23 ? parsedHour : 20,
    timezone: values.get(BACKUP_SCHEDULE_KEYS.timezone) || "Asia/Ho_Chi_Minh",
    lastSentDate: values.get(BACKUP_SCHEDULE_KEYS.lastSentDate) ?? "",
    lastSentAt: values.get(BACKUP_SCHEDULE_KEYS.lastSentAt) ?? "",
    lastError: values.get(BACKUP_SCHEDULE_KEYS.lastError) ?? "",
  };
}

export async function setSetting(key: string, value: string) {
  await db.insert(appSettings).values({ key, value, updatedAt: new Date() }).onConflictDoUpdate({
    target: appSettings.key,
    set: { value, updatedAt: new Date() },
  });
}

export async function saveBackupEmailSchedule(value: Pick<BackupEmailSchedule, "enabled" | "recipient" | "hour" | "timezone">) {
  await Promise.all([
    setSetting(BACKUP_SCHEDULE_KEYS.enabled, String(value.enabled)),
    setSetting(BACKUP_SCHEDULE_KEYS.recipient, value.recipient),
    setSetting(BACKUP_SCHEDULE_KEYS.hour, String(value.hour)),
    setSetting(BACKUP_SCHEDULE_KEYS.timezone, value.timezone),
  ]);
}

export async function markBackupEmailResult(date: string, sentAt: Date | null, error = "") {
  await Promise.all([
    ...(sentAt ? [
      setSetting(BACKUP_SCHEDULE_KEYS.lastSentDate, date),
      setSetting(BACKUP_SCHEDULE_KEYS.lastSentAt, sentAt.toISOString()),
    ] : []),
    setSetting(BACKUP_SCHEDULE_KEYS.lastError, error.slice(0, 500)),
  ]);
}

export async function isBackupAlreadySent(date: string) {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, BACKUP_SCHEDULE_KEYS.lastSentDate) });
  return row?.value === date;
}

export async function claimBackupEmail(date: string) {
  const rows = await db.insert(appSettings).values({
    key: BACKUP_SCHEDULE_KEYS.lastClaimDate,
    value: date,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: appSettings.key,
    set: { value: date, updatedAt: new Date() },
    where: ne(appSettings.value, date),
  }).returning({ key: appSettings.key });
  return rows.length > 0;
}

export async function releaseBackupEmailClaim(date: string) {
  await db.delete(appSettings).where(and(
    eq(appSettings.key, BACKUP_SCHEDULE_KEYS.lastClaimDate),
    eq(appSettings.value, date),
  ));
}
