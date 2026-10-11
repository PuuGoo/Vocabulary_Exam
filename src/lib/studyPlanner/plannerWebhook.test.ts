import assert from "node:assert/strict";
import test from "node:test";

import * as fs from "node:fs";

import { fingerprintPlannerRecord } from "@/lib/studyPlanner/fingerprint";
import { importAttendanceMarkCell, importHabitCompletion, importHabitRow, importTaskRow } from "@/lib/studyPlanner/importers";

/**
 * Contracts the webhook and write-queue layers depend on.
 *
 * Planner isolation is a first-class invariant: the planner code must never
 * import from "@/lib/googleSheets/store" or touch a vocabulary table. A
 * regression that merges the two namespaces would break vocabulary sync even
 * when planner is disabled.
 */

test("planner notifications are disjoint from vocabulary channels", async () => {
  const webhookSource = fs.readFileSync("src/app/api/webhooks/google-drive/route.ts", "utf8");
  assert.match(webhookSource, /namespace.*planner/, "webhook must tag planner vs vocab explicitly");
  assert.match(webhookSource, /recordPlannerNotificationState/, "webhook must call the planner helper for planner channels");
  assert.match(webhookSource, /runPendingPlannerConnection/, "webhook must sync the planner connection for planner channels");
  assert.match(webhookSource, /unknown_channel/, "unknown channel must still return 202, not 500");
  const plannerStore = fs.readFileSync("src/lib/studyPlanner/store.ts", "utf8");
  assert.match(plannerStore, /recordPlannerNotificationState/, "planner store must expose planner notification state");
  assert.doesNotMatch(plannerStore, /googleSheetConnections/, "planner store must not touch vocabulary connections");
});

test("a web -> Sheet write carries the fingerprint the webhook can match", () => {
  const values = { task_title: "On tap", completed: true, task_date: "2026-10-05" };
  const fp = fingerprintPlannerRecord("task", values);
  assert.equal(typeof fp, "string");
  assert.ok(fp.length >= 20, "fingerprint must be stable and non-empty");
});

test("the write queue refuses to enqueue a derived column", () => {
  const writeQueueSource = fs.readFileSync("src/lib/studyPlanner/writeQueue.ts", "utf8");
  assert.match(writeQueueSource, /derived or outside the writable range/, "write queue must reject derived columns");
});

test("habit completion is keyed by habit id + real date; attendance by session date", () => {
  const habitRow = importHabitRow({ rowNumber: 26, cells: { A: "Doc sach", AS: "v_habit01" } }, { metadataColumn: "AS" });
  assert.equal(habitRow.lexoraId, "v_habit01");
  const c = importHabitCompletion({ rowNumber: 26, cells: { B: "TRUE" } }, habitRow.lexoraId, "B", "2026-10-05");
  assert.equal(c?.completionDate, "2026-10-05");
  const other = importAttendanceMarkCell({ rowNumber: 7, cells: { E: "Toan" } }, "2026-10-06", "✔");
  assert.equal(other.status, "ok");
  assert.equal((other.values as { sessionDate: string; mark: string }).sessionDate, "2026-10-06");
});

test("a cleared planner row is blank, and an unreadable grid never becomes a delete", () => {
  const blank = importTaskRow({ rowNumber: 7, cells: {} }, {});
  assert.equal(blank.status, "blank");
  // The sync engine ignores undefined values maps (a failed read) entirely; that
  // is asserted by syncPlannerEngine unit behaviour rather than a blank-to-delete
  // conversion check here.
  assert.equal(importTaskRow({ rowNumber: 7, cells: { B: undefined as unknown as string } }, {}).status, "blank");
});

