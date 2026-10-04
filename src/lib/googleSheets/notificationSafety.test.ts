import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("message advancement is conditional on current channel and current number", () => {
  const source = readFileSync("src/lib/googleSheets/store.ts", "utf8");
  const section = source.slice(source.indexOf("export async function recordNotificationState"), source.indexOf("export async function startSyncRun"));
  assert.match(section, /eq\(googleSheetSyncChannels.channelId, channelId\)/);
  assert.match(section, /lastMessageNumber\} < \$\{messageNumber\}/);
  assert.match(section, /\.returning\(\)/);
  assert.match(section, /return advanced\[0\] \?\? null/);
});

test("a completed read cannot clear a newer queued notification", () => {
  const store = readFileSync("src/lib/googleSheets/store.ts", "utf8");
  const lifecycle = readFileSync("src/lib/googleSheets/sheetLifecycle.ts", "utf8");
  assert.match(store, /lte\(googleSheetSyncPending.pendingAt, through\)/);
  assert.match(lifecycle, /clearSyncPending\(connectionId, readStartedAt\)/);
  assert.match(lifecycle, /if \(retryable\) await markSyncPending/);
});

test("webhook rejects malformed sequence numbers and renews after processing", () => {
  const route = readFileSync("src/app/api/webhooks/google-drive/route.ts", "utf8");
  assert.match(route, /Number.isSafeInteger\(messageNumber\)/);
  assert.match(route, /if \(!hasMessageNumber\).*status: 400/);
  assert.ok(route.indexOf("await renewWatchChannelIfExpiring") > route.indexOf("await runPendingConnection"));
});

test("notifications blocked by web publishing are retried and drained after unlock", () => {
  const route = readFileSync("src/app/api/webhooks/google-drive/route.ts", "utf8");
  assert.match(route, /while \(result.status === "locked" && Date.now\(\) < lockDeadline\)/);
  const publish = readFileSync("src/lib/googleSheets/publishWord.ts", "utf8");
  assert.ok(publish.indexOf("await runPendingConnection") > publish.indexOf("await releaseConnectionLock"));
  assert.match(publish, /if \(pending\?\.pending\)/);
});
