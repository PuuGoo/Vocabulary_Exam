import { createAndSendBackupEmail } from "@/lib/backupEmail";
import {
  claimBackupEmail, getBackupEmailSchedule, markBackupEmailResult, releaseBackupEmailClaim,
} from "@/lib/backupSchedule";
import { zonedScheduleParts } from "@/lib/backupScheduleTime";
import { isEmailConfigured } from "@/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request, { params }: { params: { hour: string } }) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!/^([01]\d|2[0-3])$/.test(params.hour)) return Response.json({ error: "Invalid cron slot" }, { status: 400 });

  const schedule = await getBackupEmailSchedule();
  if (!schedule.enabled || !schedule.recipient) return Response.json({ ok: true, skipped: "disabled" });
  if (!isEmailConfigured()) return Response.json({ ok: false, error: "SMTP chưa được cấu hình." }, { status: 503 });

  const now = new Date();
  const local = zonedScheduleParts(now, schedule.timezone);
  if (local.hour !== schedule.hour) return Response.json({ ok: true, skipped: "outside-configured-hour" });
  if (!await claimBackupEmail(local.date)) return Response.json({ ok: true, skipped: "already-claimed" });

  const result = await createAndSendBackupEmail(schedule.recipient);
  if (!result.ok) {
    await markBackupEmailResult(local.date, null, result.error || "Không thể gửi email sao lưu.");
    await releaseBackupEmailClaim(local.date);
    return Response.json({ ok: false, error: result.error }, { status: 502 });
  }
  await markBackupEmailResult(local.date, now);
  return Response.json({ ok: true, sentAt: now.toISOString(), recipient: schedule.recipient });
}
