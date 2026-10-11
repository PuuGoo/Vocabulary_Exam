import { isValidCronAuthorization } from "@/lib/backupEmailCron";
import { renewGoogleWatchChannels } from "@/lib/googleSheets/watch";
import { reconcilePendingGoogleSheets } from "@/lib/googleSheets/reconcile";
import { renewPlannerWatchChannels } from "@/lib/studyPlanner/watch";
import { reconcilePendingPlanner } from "@/lib/studyPlanner/reconcile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Single daily cron entry point for Google Sheets Sync (vocabulary + planner).
 *
 * Vercel Hobby only allows cron jobs that run at most once per day, so this
 * route does both jobs: safety-net reconciliation (catches webhooks that never
 * arrived) and watch-channel renewal (Drive channels expire after ~24h).
 * Near-real-time sync itself is driven by the webhook, not by this cron.
 */
export async function GET(request: Request) {
  if (!isValidCronAuthorization(request.headers.get("authorization"), process.env.CRON_SECRET)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const [vocabRenewal, plannerRenewal] = await Promise.all([
    renewGoogleWatchChannels(),
    renewPlannerWatchChannels(),
  ]);
  const [vocabResults, plannerResults] = await Promise.all([
    reconcilePendingGoogleSheets({ trigger: "cron", limit: 50 }),
    reconcilePendingPlanner({ trigger: "cron", limit: 50 }),
  ]);
  return Response.json({
    processed: vocabResults.length + plannerResults.length,
    results: vocabResults,
    renewal: vocabRenewal,
    plannerProcessed: plannerResults.length,
    plannerResults,
    plannerRenewal,
  });
}
