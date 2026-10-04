import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("activation uses common sync inside a transaction and never replaces vocabulary IDs", () => {
  const source = readFileSync("src/lib/googleSheets/replacement.ts", "utf8");
  assert.match(source, /acquireConnectionLock\(connectionId, "replace"\)/);
  assert.match(source, /db.transaction/);
  assert.match(source, /runVocabularySync/);
  assert.match(source, /outcome.stats.rowsCreated \|\| outcome.stats.rowsUpdated \|\| outcome.stats.rowsDeleted/);
  assert.doesNotMatch(source, /tx.delete\(words\)|tx.insert\(words\)/);
  assert.ok(source.indexOf("await runVocabularySync") < source.indexOf("tx.update(googleSheetConnections)"));
  assert.ok(source.indexOf("activated = true") < source.indexOf("await api.trashSpreadsheet"));
  assert.match(source, /trashPrevious && !connection.managedByLexora/);
  assert.match(source, /status: "failed"/);
});

test("replace route checks manage permission, folder editor access and exact confirmation", () => {
  const source = readFileSync("src/app/api/admin/google-sheets/connections/[id]/replace/route.ts", "utf8");
  assert.match(source, /requireAdminPermission\("google_sheets.manage"\)/);
  assert.match(source, /level: "editor"/);
  assert.match(source, /confirm: z.literal\(true\)/);
  assert.match(source, /trashPrevious: z.boolean\(\).default\(false\)/);
});

test("watch renewal ignores stopped resource history", () => {
  const source = readFileSync("src/lib/googleSheets/watch.ts", "utf8");
  assert.equal(source.match(/eq\(googleSheetSyncChannels.status, "active"\)/g)?.length, 3);
});

test("resource history is folder-authorized and omits watch secrets and errors", () => {
  const source = readFileSync("src/app/api/admin/google-sheets/connections/[id]/resources/route.ts", "utf8");
  assert.match(source, /requireAdminPermission\("google_sheets.view"\)/);
  assert.match(source, /level: "viewer"/);
  const projection = source.slice(source.indexOf("const resources"));
  assert.doesNotMatch(projection, /channelToken|channelId|resourceId|googleSheetResources.error/);
  assert.match(projection, /limit\(100\)/);
});
