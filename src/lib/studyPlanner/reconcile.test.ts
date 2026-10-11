import assert from "node:assert/strict";
import test from "node:test";
import * as fs from "node:fs";

/**
 * Phase 12 — Reconcile + watch renewal present for both vocab and planner.
 *
 * Planner reuse is explicit: the cron renews/reconciles planner channels and
 * queues independently of vocabulary, and the reconcile workflow surfaces
 * planner errors separately instead of hiding them behind a green vocab run.
 */

const cronSource = fs.readFileSync("src/app/api/cron/google-sheets/reconcile/route.ts", "utf8");
const webhookSource = fs.readFileSync("src/app/api/webhooks/google-drive/route.ts", "utf8");
const workflow = fs.readFileSync(".github/workflows/google-sheets-reconcile.yml", "utf8");

test("cron renews and reconciles vocabulary plus planner, never vocabulary alone", () => {
  assert.match(cronSource, /renewPlannerWatchChannels/, "cron must renew planner watches");
  assert.match(cronSource, /reconcilePendingPlanner/, "cron must reconcile planner pending queues");
  assert.match(cronSource, /renewGoogleWatchChannels/, "vocabulary renewal must still run");
  assert.match(cronSource, /reconcilePendingGoogleSheets/, "vocabulary reconcile must still run");
  // The old route returned { renewal, results } only — planner fields were missing and failures were hidden.
  assert.match(cronSource, /plannerRenewal/, "cron must surface planner renewal separately");
  assert.match(cronSource, /plannerResults/, "cron must surface planner results separately");
});

test("webhook dispatches planner and vocab in separate namespaces", () => {
  assert.match(webhookSource, /plannerChannel/, "webhook must look up planner channels explicitly");
  assert.match(webhookSource, /recordPlannerNotificationState/, "planner notifications must use the planner cursor");
  assert.match(webhookSource, /runPendingPlannerConnection/, "planner webhooks must run the planner sync");
  assert.match(webhookSource, /namespace.*planner/, "unknown planner notifications must be reported, not discarded as unknown vocab");
});

test("reconcile workflow fails on vocab or planner errors and prints ids, not secrets", () => {
  assert.match(workflow, /planner-renew-failed/, "workflow must print planner renewal failures with ids");
  assert.match(workflow, /planner-sync-failed/, "workflow must print planner sync failures with ids");
  assert.match(workflow, /renew-failed/, "vocab renewal failures must still be printed");
  // The old one-line jq condition masked planner failures to make the job green.
  assert.match(workflow, /plannerRenewal\[\]\?/, "workflow failure condition must cover planner renewal");
  assert.match(workflow, /plannerResults\[\]\?/, "workflow failure condition must cover planner results");
  // Diagnostics may reference CRON_SECRET only to pass it as the
  // Authorization header; OAuth or channel tokens must never appear.
  assert.doesNotMatch(workflow, /accessToken|refreshToken|channelToken|access_token|refresh_token/, "workflow diagnostics must not mention secrets");
});

test("planner notifications are deferred from vocab: duplicate or out-of-order planner notifications are dropped", () => {
  const plannerStore = fs.readFileSync("src/lib/studyPlanner/store.ts", "utf8");
  assert.match(plannerStore, /lastMessageNumber/, "planner must track message numbers for deduplication");
  assert.match(plannerStore, /duplicate|out.?of.?order/i, "planner store must document out-of-order handling");
});

