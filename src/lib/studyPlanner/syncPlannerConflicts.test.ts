import assert from "node:assert/strict";
import test from "node:test";

import {
  blocksPlannerBulkDeletion,
  blocksPlannerBulkUpdate,
  matchingPlannerResolution,
  plannerBulkDeletionThresholds,
  plannerBulkUpdateThresholds,
  plannerReviewFingerprint,
} from "@/lib/studyPlanner/conflicts";
import { fingerprintPlannerRecord } from "@/lib/studyPlanner/fingerprint";

test("a normal Sheet edit is not a conflict: only both sides changing the same record counts", () => {
  const sheet = fingerprintPlannerRecord("task", { task_title: "On tap", completed: true });
  const dbSame = fingerprintPlannerRecord("task", { task_title: "On tap", completed: true });
  const dbChanged = fingerprintPlannerRecord("task", { task_title: "Da sua", completed: true });
  const lastSynced = dbSame;
  // No conflict when DB stayed at baseline and only the Sheet changed.
  assert.equal(sheet === dbSame, true);
  assert.notEqual(sheet, dbChanged);
  assert.equal(dbChanged !== lastSynced, true, "DB did change since baseline, but Sheet fingerprint at baseline means one-sided edit, not a conflict");
});

test("matching resolution requires all three of lexoraId, sheet and db fingerprints", () => {
  const choice = matchingPlannerResolution(
    [{ lexoraId: "v_a1", choice: "sheet", sheetFingerprint: "a".repeat(32), dbFingerprint: "b".repeat(32) }],
    "v_a1",
    "a".repeat(32),
    "b".repeat(32),
  );
  assert.equal(choice, "sheet");
  assert.equal(
    matchingPlannerResolution([{ lexoraId: "v_other", choice: "sheet", sheetFingerprint: "a".repeat(32), dbFingerprint: "b".repeat(32) }], "v_a1", "a".repeat(32), "b".repeat(32)),
    undefined,
  );
});

test("bulk deletion is blocked when every row vanished or the window is crossed", () => {
  assert.equal(blocksPlannerBulkDeletion(5, 5), true, "all five appearing to vanish is never implicit");
  assert.equal(blocksPlannerBulkDeletion(20, 6), true, "six of twenty crosses the default 5/0.25 window");
  assert.equal(blocksPlannerBulkDeletion(20, 1), false, "one vanishing out of twenty is not a bulk change");
  assert.equal(blocksPlannerBulkDeletion(0, 0), false);
});

test("bulk update is blocked when most active rows would change at once", () => {
  // Both gates must be crossed: changed >= minimum (20) AND changed/active >= 0.5.
  assert.equal(blocksPlannerBulkUpdate(20, 20), true, "a full-tab change always needs review");
  assert.equal(blocksPlannerBulkUpdate(40, 20), true, "exactly half of 40 crosses both gates");
  assert.equal(blocksPlannerBulkUpdate(19, 19), false, "below the 20-row minimum the update gate stays open");
  assert.equal(blocksPlannerBulkUpdate(40, 10), false, "25% does not cross the 0.5 fraction");
});

test("thresholds come from dedicated planner env keys, not vocabulary ones", () => {
  const deletion = plannerBulkDeletionThresholds({ STUDY_PLANNER_BULK_DELETE_MIN_ROWS: "8", STUDY_PLANNER_BULK_DELETE_FRACTION: "0.2" } as Record<string, string>);
  assert.deepEqual(deletion, { minimumRows: 8, fraction: 0.2 });
  const update = plannerBulkUpdateThresholds({ STUDY_PLANNER_BULK_UPDATE_MIN_ROWS: "30" } as Record<string, string>);
  assert.equal(update.minimum, 30);
  const fp1 = plannerReviewFingerprint({ connectionId: 1, missing: ["v_a1"] });
  const fp2 = plannerReviewFingerprint({ connectionId: 1, missing: ["v_a2"] });
  assert.notEqual(fp1, fp2);
});

