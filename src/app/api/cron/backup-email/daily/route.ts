import { createAndSendBackupEmail } from '@/lib/backupEmail';
import {
  claimBackupEmail, getBackupEmailSchedule, markBackupCronHeartbeat, markBackupEmailAttempt, markBackupEmailResult, releaseBackupEmailClaim,
} from '@/lib/backupSchedule';
import { isStaleBackupAttempt, zonedScheduleParts } from '@/lib/backupScheduleTime';
import { isEmailConfigured } from '@/lib/mailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SCHEDULED_LOCAL_HOUR = 0; // Backup always fires at 00:00 ICT (cron runs at 17:00 UTC daily).

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  await markBackupCronHeartbeat(now);
  const schedule = await getBackupEmailSchedule();
  if (!schedule.enabled || !schedule.recipient) return Response.json({ ok: true, skipped: 'disabled' });

  const local = zonedScheduleParts(now, schedule.timezone);
  // Single daily cron at 17:00 UTC fires at 00:00 ICT. We only send when the
  // local clock is past the scheduled hour so a slow cron tick still triggers.
  if (local.hour < SCHEDULED_LOCAL_HOUR) return Response.json({ ok: true, skipped: 'before-configured-hour' });
  if (!isEmailConfigured()) {
    const error = 'SMTP chưa được cấu hình.';
    await Promise.all([markBackupEmailResult(local.date, null, error), markBackupEmailAttempt(now, 'error')]);
    return Response.json({ ok: false, error }, { status: 503 });
  }
  if (isStaleBackupAttempt(schedule.lastAttemptAt, schedule.lastAttemptStatus, now)) {
    await releaseBackupEmailClaim(local.date);
  }
  if (!await claimBackupEmail(local.date)) return Response.json({ ok: true, skipped: 'already-claimed' });
  await markBackupEmailAttempt(now, 'running');

  try {
    const result = await createAndSendBackupEmail(schedule.recipient);
    if (!result.ok) {
      await Promise.all([
        markBackupEmailResult(local.date, null, result.error || 'Không thể gửi email sao lưu.'),
        markBackupEmailAttempt(now, 'error'),
      ]);
      await releaseBackupEmailClaim(local.date);
      return Response.json({ ok: false, error: result.error }, { status: 502 });
    }
    await Promise.all([markBackupEmailResult(local.date, now), markBackupEmailAttempt(now, 'success')]);
    return Response.json({ ok: true, sentAt: now.toISOString(), recipient: schedule.recipient });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tiến trình tạo bản sao lưu gặp lỗi bất ngờ.';
    await Promise.all([markBackupEmailResult(local.date, null, message), markBackupEmailAttempt(now, 'error')]);
    await releaseBackupEmailClaim(local.date);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

