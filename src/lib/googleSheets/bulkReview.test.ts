import assert from "node:assert/strict";
import test from "node:test";
import { blocksBulkUpdate, bulkDeletionThresholds, deletionReviewFingerprint } from "./bulkReview";
import { blocksBulkDeletion } from "./reliability";
import { syncRequestSchema } from "./reliability";

const snapshot = { connectionId: 1, spreadsheetId: "sheet-a", deleteBehavior: "archive", grid: [["term"], ["hello"]], words: [{ id: 42, term: "hello" }], mappings: [{ sourceId: "v_12345678", wordId: 42 }] };
test("bulk approval is bound to Sheet content, database, mappings and resource", () => {
  const original = deletionReviewFingerprint(snapshot);
  assert.equal(original, deletionReviewFingerprint(structuredClone(snapshot)));
  for (const changed of [{ connectionId: 2 }, { spreadsheetId: "sheet-b" }, { deleteBehavior: "delete" }, { grid: [] }, { words: [] }, { mappings: [] }]) {
    assert.notEqual(original, deletionReviewFingerprint({ ...snapshot, ...changed }));
  }
});
test("bulk approval requires an exact fingerprint, not a blanket force switch", () => {
  assert.equal(syncRequestSchema.safeParse({ deletionApproval: true }).success, false);
  assert.equal(syncRequestSchema.safeParse({ force: true }).success, false);
  assert.equal(syncRequestSchema.safeParse({ deletionApproval: deletionReviewFingerprint(snapshot) }).success, true);
});

test("threshold overrides are validated and cannot disable all-row protection", () => {
  assert.deepEqual(bulkDeletionThresholds({}), { minimumRows: 5, fraction: 0.25 });
  assert.deepEqual(bulkDeletionThresholds({ GOOGLE_SHEETS_BULK_DELETE_MIN_ROWS: "bad", GOOGLE_SHEETS_BULK_DELETE_FRACTION: "2" }), { minimumRows: 5, fraction: 0.25 });
  const custom = bulkDeletionThresholds({ GOOGLE_SHEETS_BULK_DELETE_MIN_ROWS: "20", GOOGLE_SHEETS_BULK_DELETE_FRACTION: "0.5" });
  assert.equal(blocksBulkDeletion(100, 25, custom), false);
  assert.equal(blocksBulkDeletion(100, 50, custom), true);
  assert.equal(blocksBulkDeletion(1, 1, custom), true);
});

test("bulk update thresholds leave normal edits automatic", () => {
  assert.equal(blocksBulkUpdate(1, 1, {}), false);
  assert.equal(blocksBulkUpdate(100, 49, {}), false);
  assert.equal(blocksBulkUpdate(100, 50, {}), true);
  assert.equal(blocksBulkUpdate(100, 25, { GOOGLE_SHEETS_BULK_UPDATE_MIN_ROWS: "10", GOOGLE_SHEETS_BULK_UPDATE_FRACTION: "0.2" }), true);
});
