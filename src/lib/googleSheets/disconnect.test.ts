import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("disconnect retires local delivery and pending work without touching vocabulary or Drive files", () => {
  const source = readFileSync("src/lib/googleSheets/disconnect.ts", "utf8");
  assert.match(source, /acquireConnectionLock\(connectionId, "disconnect"\)/);
  assert.match(source, /db.transaction/);
  assert.match(source, /status: "stopped"/);
  assert.match(source, /pending: false/);
  assert.match(source, /stopWatchChannel\(channel.channelId, channel.resourceId\)/);
  assert.doesNotMatch(source, /trashSpreadsheet|deleteSpreadsheet|tx\.delete|tx\.update\(words/);
  assert.match(source, /finally[\s\S]*releaseConnectionLock/);
});

test("settings cannot revive terminal connections and both disconnect endpoints share lifecycle", () => {
  const source = readFileSync("src/app/api/admin/google-sheets/connections/[id]/route.ts", "utf8");
  assert.equal(source.match(/await disconnectGoogleSheet\(connectionId, access.userId\)/g)?.length, 2);
  assert.match(source, /\["archived", "replaced", "missing", "disconnected"\].includes\(current.status\)/);
  assert.match(source, /acquireConnectionLock\(connectionId, "settings"\)/);
});

test("sync rechecks active resource after acquiring the lifecycle lock", () => {
  const source = readFileSync("src/lib/googleSheets/sheetLifecycle.ts", "utf8");
  const section = source.slice(source.indexOf("await acquireConnectionLock(connectionId, trigger)"));
  assert.ok(section.indexOf("Object.assign(connection, current)") < section.indexOf('status: "syncing"'));
  assert.match(section, /!current\?\.enabled/);
});
