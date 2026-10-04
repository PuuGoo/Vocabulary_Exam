import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createFakeGoogleWorkspaceApi } from "./api";
import { replaceWatchSafely } from "./watchReplacement";

test("renewal persists the replacement before stopping old delivery", async () => {
  const events: string[] = [];
  const api = createFakeGoogleWorkspaceApi({ stopWatchChannel: async id => { events.push(`stop:${id}`); } });
  const result = await replaceWatchSafely(api, { channelId: "old", resourceId: "resource", spreadsheetId: "sheet" }, async () => { events.push("persist"); });
  assert.deepEqual(events, ["persist", "stop:old"]);
  assert.equal(result.cleanupPending, false);
});

test("failed persistence retains the old watch and cleans only the new channel", async () => {
  const stopped: string[] = [];
  const api = createFakeGoogleWorkspaceApi({ stopWatchChannel: async id => { stopped.push(id); } });
  await assert.rejects(replaceWatchSafely(api, { channelId: "old", resourceId: "resource", spreadsheetId: "sheet" }, async () => { throw new Error("db unavailable"); }));
  assert.equal(stopped.length, 1);
  assert.notEqual(stopped[0], "old");
});

test("lazy and cron renewal serialize against resource lifecycle changes", () => {
  const source = readFileSync("src/lib/googleSheets/watch.ts", "utf8");
  assert.match(source, /acquireConnectionLock\(channel.connectionId, "renew_watch"\)/);
  assert.match(source, /acquireConnectionLock\(connectionId, "renew_watch"\)/);
  assert.match(source, /currentChannel.channelId !== channel.channelId/);
  assert.doesNotMatch(source, /api.renewWatchChannel\(/);
});
