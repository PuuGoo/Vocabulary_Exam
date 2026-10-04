import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { trashManagedSpreadsheet } from "./resourceSafety";

test("external spreadsheets are rejected before any Google mutation", async () => {
  let called = false;
  await assert.rejects(trashManagedSpreadsheet({ managedByLexora: false, spreadsheetId: "external" }, "external", { trashSpreadsheet: async () => { called = true; } }), /Sheet bên ngoài/);
  assert.equal(called, false);
});
test("trash is bound to the confirmed file and never permanently deletes", async () => {
  const trashed: string[] = [];
  const api = { trashSpreadsheet: async (id: string) => { trashed.push(id); } };
  await assert.rejects(trashManagedSpreadsheet({ managedByLexora: true, spreadsheetId: "new" }, "old", api), /Sheet đã thay đổi/);
  assert.deepEqual(trashed, []);
  await trashManagedSpreadsheet({ managedByLexora: true, spreadsheetId: "new" }, "new", api);
  assert.deepEqual(trashed, ["new"]);
});
test("trash route enforces authorization, a sync lock and preserves vocabulary tables", () => {
  const route = readFileSync("src/app/api/admin/google-sheets/connections/[id]/trash/route.ts", "utf8");
  assert.match(route, /requireAdminPermission\("google_sheets.manage"\)/);
  assert.match(route, /requireAdminResourceAccess/);
  assert.match(route, /acquireConnectionLock/);
  assert.match(route, /releaseConnectionLock/);
  assert.doesNotMatch(route, /\.delete\(|update\(words\)|wordProgress|mistakes/);
  const client = readFileSync("src/lib/googleSheets/client.ts", "utf8");
  assert.match(client, /trashed: true/);
  assert.doesNotMatch(client, /drive\.files\.delete/);
});
