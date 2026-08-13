export function zonedScheduleParts(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${value("year")}-${value("month")}-${value("day")}`, hour: Number(value("hour")) };
}

export function isBackupWindowOpen(localHour: number, scheduledHour: number) {
  return localHour >= scheduledHour;
}

export function isStaleBackupAttempt(lastAttemptAt: string, status: string, now: Date, timeoutMs = 90 * 60 * 1000) {
  if (status !== "running" || !lastAttemptAt) return false;
  const startedAt = new Date(lastAttemptAt).getTime();
  return Number.isFinite(startedAt) && now.getTime() - startedAt >= timeoutMs;
}
