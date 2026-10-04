import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("permanent failures and retired connections cannot starve the pending queue", () => {
  const source = readFileSync("src/lib/googleSheets/store.ts", "utf8");
  const queue = source.slice(source.indexOf("export async function takePendingConnections"), source.indexOf("export async function recordNotificationState"));
  assert.match(queue, /innerJoin\(googleSheetConnections/);
  assert.match(queue, /eq\(googleSheetConnections.enabled, true\)/);
  assert.match(queue, /inArray\(googleSheetConnections.status, \["connected", "syncing"\]\)/);
  assert.match(queue, /orderBy\(asc\(googleSheetSyncPending.pendingAt\)/);
});

test("stale reconciliation does not automatically retry permanent errors", () => {
  const source = readFileSync("src/lib/googleSheets/reconcile.ts", "utf8");
  assert.match(source, /inArray\(googleSheetConnections.status, \["connected", "syncing"\]\)/);
});

test("hourly authenticated scheduler reuses reconciliation and renews before expensive sync", () => {
  const workflow = readFileSync(".github/workflows/google-sheets-reconcile.yml", "utf8");
  assert.match(workflow, /cron: '17 \* \* \* \*'/);
  assert.match(workflow, /secrets.CRON_SECRET/);
  assert.match(workflow, /Authorization: Bearer \$CRON_SECRET/);
  assert.match(workflow, /permissions: \{\}/);
  assert.doesNotMatch(workflow, /--location|--verbose|set -x/);
  const route = readFileSync("src/app/api/cron/google-sheets/reconcile/route.ts", "utf8");
  assert.ok(route.indexOf("await renewGoogleWatchChannels") < route.indexOf("await reconcilePendingGoogleSheets"));
  assert.doesNotMatch(route, /thresholdHours: 26/);
});
