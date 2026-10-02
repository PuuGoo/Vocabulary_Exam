import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { generateChannelToken, hashChannelToken, verifyChannelToken } from "@/lib/googleSheets/channelToken";
import { WATCH_CHANNEL_EXPIRATION_MS } from "@/lib/googleSheets/api";

/**
 * Google Drive push notifications authenticate with the channel `token` we set
 * at `files.watch` time, which Google echoes back as X-Goog-Channel-Token. The
 * notification body is empty, so it can never be the source of the secret.
 */

test("1. createWatchChannel sends a channel token and a 22h expiration", () => {
  const client = readFileSync("src/lib/googleSheets/client.ts", "utf8");
  assert.match(client, /token: channelToken/, "files.watch requestBody must carry the token");
  assert.match(client, /randomBytes\(32\)/, "the token must be random per channel");
  assert.match(client, /expiration: String\(Date\.now\(\) \+ WATCH_CHANNEL_EXPIRATION_MS\)/, "expiration must come from the shared constant");
  // A brand-new channel id per watch (renewal must never reuse one).
  assert.match(client, /id: `lexora-\$\{randomBytes\(8\)\.toString\("hex"\)\}`/, "each watch must mint a unique channel id");
});

test("2/3/4. webhook token verification accepts right, rejects missing and wrong", () => {
  const token = generateChannelToken();
  const hash = hashChannelToken(token);
  assert.equal(verifyChannelToken(token, hash), true, "correct token must be accepted");
  assert.equal(verifyChannelToken("", hash), false, "missing token must be rejected");
  assert.equal(verifyChannelToken(undefined, hash), false, "absent header must be rejected");
  assert.equal(verifyChannelToken(generateChannelToken(), hash), false, "wrong token must be rejected");
  // A legacy row has no digest: it can never verify, so it fails closed.
  assert.equal(verifyChannelToken(token, null), false, "legacy channel without a digest must be rejected");
  assert.equal(verifyChannelToken(token, undefined), false);
});

test("the channel token is random, secret and never carries OAuth material", () => {
  const a = generateChannelToken();
  const b = generateChannelToken();
  assert.notEqual(a, b, "two channels must never share a token");
  assert.equal(a.length, 64, "32 bytes as hex");
  assert.match(a, /^[0-9a-f]+$/);
  const tokenSource = readFileSync("src/lib/googleSheets/channelToken.ts", "utf8");
  assert.ok(!/access_token|refresh_token|client_secret|Bearer/i.test(tokenSource), "no OAuth material in the channel token");
  // The digest is one-way: knowing it must not reveal the token.
  assert.notEqual(hashChannelToken(a), a);
  assert.equal(hashChannelToken(a).length, 64);
});

test("5. the webhook never reads the (empty) notification body", () => {
  const webhook = readFileSync("src/app/api/webhooks/google-drive/route.ts", "utf8");
  // Ignore comments first: the route documents why body-HMAC was abandoned.
  const code = webhook.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.ok(!/req\.text\(\)/.test(code), "must not parse the request body");
  assert.ok(!/createHmac|timingSafeEqual/i.test(code), "must not authenticate the body");
  assert.ok(!/JSON\.parse/.test(code), "must not parse JSON from the body");
  assert.ok(!/\bbody\b/.test(code), "no body dependency at all");
  // Authentication comes from the stored digest instead.
  assert.match(code, /verifyChannelToken\(/, "must authenticate via the stored token digest");
});

test("6. resource state sync is acknowledged without running a diff", () => {
  const webhook = readFileSync("src/app/api/webhooks/google-drive/route.ts", "utf8");
  assert.match(webhook, /x-goog-resource-state/, "must read the state header");
  assert.match(webhook, /resourceState === "sync"/, "must branch on sync");
  // The sync branch returns before markSyncPending/runPendingConnection.
  const syncBranch = /if \(resourceState === "sync"\) \{([\s\S]*?)\n  \}/.exec(webhook)?.[1] ?? "";
  assert.ok(syncBranch, "sync branch must exist");
  assert.ok(!syncBranch.includes("runPendingConnection"), "a sync notification must not trigger a vocabulary diff");
  assert.ok(syncBranch.includes("recordNotificationState"), "the sync notification must still be recorded");
  assert.match(webhook, /202/, "must answer 202");
});

test("7. resource state update with changed=content triggers a sync", () => {
  const webhook = readFileSync("src/app/api/webhooks/google-drive/route.ts", "utf8");
  assert.match(webhook, /x-goog-changed/, "must read the changed header");
  assert.match(webhook, /markSyncPending\(connection\.id, "webhook"\)/, "update notifications must mark pending before syncing");
  assert.match(webhook, /runPendingConnection\(connection\.id, "webhook"\)/, "update notifications must run the shared sync");
  assert.match(webhook, /changed: changed \|\| null/, "the response must echo the changed header for diagnostics");
});

test("8/9. message numbers reject duplicates and out-of-order notifications", () => {
  const webhook = readFileSync("src/app/api/webhooks/google-drive/route.ts", "utf8");
  assert.match(webhook, /messageNumber <= channel\.lastMessageNumber/, "only <= lastMessageNumber is rejected");
  assert.ok(!/=== channel\.lastMessageNumber \+ 1/.test(webhook), "numbers are not required to be sequential");
  const store = readFileSync("src/lib/googleSheets/store.ts", "utf8");
  assert.match(store, /messageNumber <= channel\.lastMessageNumber/, "recordNotificationState enforces the same rule");
  assert.match(webhook, /duplicate_or_out_of_order/, "duplicates are acknowledged, not synced");
});

test("10/11. legacy channels are recreated and renewal mints a new token", () => {
  const watch = readFileSync("src/lib/googleSheets/watch.ts", "utf8");
  assert.match(watch, /includeTokenless/, "the renewal routine must consider tokenless channels");
  assert.match(watch, /missingToken/, "a channel without a digest must be replaced");
  assert.match(watch, /channelTokenHash: renewed\.channelToken \? hashChannelToken/, "renewal must store the new digest");
  const client = readFileSync("src/lib/googleSheets/client.ts", "utf8");
  const renew = /async renewWatchChannel\([\s\S]*?\n    \},/.exec(client)?.[0] ?? "";
  assert.match(renew, /channels\.stop/, "the old channel must be stopped when possible");
  assert.match(renew, /createWatchChannel/, "renewal must create a fresh channel (new id + new token)");
  const schema = readFileSync("src/db/schema.ts", "utf8");
  assert.match(schema, /channelTokenHash/, "the digest column must exist");
  assert.ok(readFileSync("drizzle/0034_google_sheets_channel_token.sql", "utf8").includes("ADD COLUMN IF NOT EXISTS"), "migration must be additive");
});

test("12. channel lifetime is renewed lazily by the webhook, not only by cron", () => {
  // Google caps watch channels at ~24h, so we ask for 23h of life.
  assert.equal(WATCH_CHANNEL_EXPIRATION_MS, 1000 * 60 * 60 * 23);
  assert.ok(WATCH_CHANNEL_EXPIRATION_MS <= 1000 * 60 * 60 * 24, "Google caps watch channels at ~24h");

  // A daily cron alone cannot guarantee renewal: a channel created just after
  // the cron runs would expire before the next run. The webhook therefore
  // renews opportunistically whenever a notification proves the channel alive.
  const webhook = readFileSync("src/app/api/webhooks/google-drive/route.ts", "utf8");
  assert.match(webhook, /renewWatchChannelIfExpiring\(channel\.connectionId\)/, "the webhook must top the channel up opportunistically");
  assert.ok(/if \(resourceState === "sync"\)/.test(webhook), "renewal must run on every valid notification, not only on content updates");

  const watch = readFileSync("src/lib/googleSheets/watch.ts", "utf8");
  assert.match(watch, /WATCH_CHANNEL_RENEW_THRESHOLD_MS/, "the renewal threshold must be shared");
  assert.match(watch, /catch \(error\)/, "a renewal failure must never fail the sync");

  // The daily cron stays as a safety net and still renews expiring channels.
  const cron = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: Array<{ path: string; schedule: string }> };
  const reconcile = cron.crons.find((entry) => entry.path.includes("google-sheets"));
  assert.ok(reconcile, "the google-sheets cron must exist");
  assert.match(reconcile!.schedule, /^\d{1,2} \d{1,2} \* \* \*$/, "renewal must run once a day, not hourly (Vercel Hobby limit)");
});
test("webhook logs never contain the token or OAuth credentials", () => {
  const webhook = readFileSync("src/app/api/webhooks/google-drive/route.ts", "utf8");
  const logs = webhook.match(/console\.(log|warn|error)\([\s\S]*?\);/g) ?? [];
  assert.ok(logs.length > 0, "the webhook must log the notification for diagnostics");
  for (const entry of logs) {
    assert.ok(!/channelToken|accessToken|refreshToken|client_secret|Bearer/i.test(entry), `unsafe log: ${entry.slice(0, 80)}`);
    assert.ok(!/token=/.test(entry), "the raw token must never be logged");
  }
  // Good diagnostics are expected.
  const joined = logs.join("\n");
  assert.match(joined, /channelId=/);
  assert.match(joined, /messageNumber=/);
  assert.match(joined, /state=/);
});
