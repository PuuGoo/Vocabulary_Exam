import { createAndSendBackupEmail } from "@/lib/backupEmail";
import { isValidCronAuthorization, runScheduledBackup } from "@/lib/backupEmailCron";
import { claimBackupEmail, getBackupEmailSchedule, isBackupAlreadySent, markBackupCronHeartbeat, markBackupEmailAttempt, markBackupEmailResult, releaseBackupEmailClaim } from "@/lib/backupSchedule";
import { isEmailConfigured } from "@/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isValidCronAuthorization(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    console.warn("[backup-cron] authentication rejected");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.log("[backup-cron] authenticated");
  const outcome = await runScheduledBackup({
    now: new Date(), getSchedule: getBackupEmailSchedule, heartbeat: markBackupCronHeartbeat,
    alreadySent: isBackupAlreadySent, configured: isEmailConfigured, claim: claimBackupEmail,
    release: releaseBackupEmailClaim, attempt: markBackupEmailAttempt, result: markBackupEmailResult,
    send: (recipient) => createAndSendBackupEmail(recipient, { logStages: true }),
  });
  return Response.json(outcome, { status: "status" in outcome ? outcome.status : 200 });
}
