import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { blocksBulkDeletion, matchingResolution, syncIsPartial, syncRequestSchema } from "./reliability";

test("a sync is partial for conflicts, invalid rows, duplicates or protected deletions", () => {
  assert.equal(syncIsPartial({ conflicts: [], invalidRows: [] }), false);
  assert.equal(syncIsPartial({ conflicts: [{}], invalidRows: [] }), true);
  assert.equal(syncIsPartial({ conflicts: [], invalidRows: [{}] }), true);
  assert.equal(syncIsPartial({ conflicts: [], invalidRows: [], deletionBlocked: 12 }), true);
  assert.equal(syncIsPartial({ conflicts: [], invalidRows: [], duplicateCount: 1 }), true);
});

test("a resolution applies only to the exact pair of versions reviewed", () => {
  const resolutions = [{ sourceId: "word", choice: "sheet" as const, sheetFingerprint: "sheet", dbFingerprint: "db" }];
  assert.equal(matchingResolution(resolutions, "word", "sheet", "db"), "sheet");
  assert.equal(matchingResolution(resolutions, "word", "new-sheet", "db"), undefined);
  assert.equal(matchingResolution(resolutions, "word", "sheet", "new-db"), undefined);
  assert.equal(matchingResolution(resolutions, "other", "sheet", "db"), undefined);
});

test("empty sheets and large deletions are protected but small edits remain automatic", () => {
  assert.equal(blocksBulkDeletion(0, 0), false);
  assert.equal(blocksBulkDeletion(1, 1), true);
  assert.equal(blocksBulkDeletion(12, 12), true);
  assert.equal(blocksBulkDeletion(20, 5), true);
  assert.equal(blocksBulkDeletion(100, 5), false);
  assert.equal(blocksBulkDeletion(12, 1), false);
});

test("sync input rejects unknown options and malformed resolution payloads", () => {
  assert.equal(syncRequestSchema.safeParse({}).success, true);
  assert.equal(syncRequestSchema.safeParse({ repairWatch: true }).success, true);
  assert.equal(syncRequestSchema.safeParse({ force: true }).success, false);
  assert.equal(syncRequestSchema.safeParse({ resolutions: [{ sourceId: "word", choice: "sheet" }] }).success, false);
});

test("server reconciliation preserves partial status instead of claiming full success", () => {
  const source = readFileSync("src/lib/googleSheets/reconcile.ts", "utf8");
  assert.match(source, /syncIsPartial\(result.stats\) \? "partial" : "synced"/);
  assert.match(source, /lastSyncedAt/);
  assert.match(source, /inArray\(googleSheetConnections.status, \["connected", "syncing"\]\)/);
});
