import * as fs from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

import { gridFromPlannerValues, metadataWriteRanges } from "@/lib/studyPlanner/columnGrid";
import {
  importActivityRow,
  importAssignmentRow,
  importAttendanceMarkCell,
  importCourseRow,
  importCurriculumRow,
  importHabitCompletion,
  importHabitRow,
  importReadingRow,
  importSessionCell,
  importTaskRow,
  importTodoRow,
  readAttendanceCourseName,
} from "@/lib/studyPlanner/importers";

const cells = (entries: Record<string, unknown>) => ({ rowNumber: 7, cells: entries as Record<string, string | null | undefined> });

test("a task row without a date or title is invalid, never a silent null overwrite", () => {
  const ok = importTaskRow(cells({ B: "2026-10-05", H: "Luyen nghe" }), {});
  assert.equal(ok.status, "ok");
  const missing = importTaskRow(cells({ B: "2026-10-05" }), {});
  assert.equal(missing.status, "invalid");
  assert.ok(missing.invalidKeys?.includes("task_title"));
  const blank = importTaskRow(cells({}), {});
  assert.equal(blank.status, "blank");
});

test("task checkboxes, times and durations normalize through one shared layer", () => {
  const row = importTaskRow(cells({ B: "05/10/2026", C: "TRUE", D: "07:30", E: 0.5, H: "On tap", J: "1:30" }), {});
  assert.equal(row.status, "ok");
  assert.equal((row.values as { completed: boolean }).completed, true);
  assert.equal((row.values as { startTime: number | null }).startTime, 0.3125);
  assert.equal((row.values as { endTime: number | null }).endTime, 0.5);
  assert.equal((row.values as { durationMinutes: number | null }).durationMinutes, 90);
});

test("a cleared task row is blank, not a delete instruction by itself", () => {
  const cleared = importTaskRow(cells({ B: "", H: "" }), {});
  assert.equal(cleared.status, "blank");
});

test("sorting rows never changes identity: identity lives in the metadata column", () => {
  const first = importTaskRow({ rowNumber: 7, cells: { B: "2026-10-05", H: "Hoc tu", AP: "v_abcdef01" } }, { metadataColumn: "AP" });
  const moved = importTaskRow({ rowNumber: 42, cells: { B: "2026-10-05", H: "Hoc tu", AP: "v_abcdef01" } }, { metadataColumn: "AP" });
  assert.equal(first.lexoraId, "v_abcdef01");
  assert.equal(moved.lexoraId, "v_abcdef01");
  assert.equal(first.fingerprint, moved.fingerprint, "moving a row must not look like an edit");
});

test("course, curriculum, assignment, reading, todo and activity rows reject missing keys", () => {
  assert.equal(importCourseRow(cells({ A: "Toan cao cap", B: "MATH101" }), {}).status, "ok");
  assert.equal(importCourseRow(cells({ B: "MATH101" }), {}).status, "invalid");
  assert.equal(importCurriculumRow(cells({ A: "Toan", B: "Gioi han" }), {}).status, "ok");
  assert.equal(importCurriculumRow(cells({ A: "Toan" }), {}).status, "invalid");
  assert.equal(importAssignmentRow(cells({ B: "Bai tap 1" }), {}).status, "ok");
  assert.equal(importAssignmentRow(cells({ A: "Toan" }), {}).status, "invalid");
  assert.equal(importReadingRow(cells({ A: "Toan", B: "Giai tich 1" }), {}).status, "ok");
  assert.equal(importReadingRow(cells({ A: "Toan" }), {}).status, "invalid");
  assert.equal(importTodoRow(cells({ B: "Mua vo" }), {}).status, "ok");
  assert.equal(importTodoRow(cells({ B: "" }), {}).status, "blank");
  assert.equal(importActivityRow(cells({ A: "2026-10-05", D: "Hoc nhom" }), {}).status, "ok");
  assert.equal(importActivityRow(cells({ D: "Hoc nhom" }), {}).status, "invalid");
});

test("sessions, habits and attendance carry no row-position identity", () => {
  const session = importSessionCell(cells({}), "T2", "07:30", "09:00", "P.201");
  assert.equal(session.status, "ok");
  assert.equal((session.values as { weekday: number }).weekday, 1);
  const habit = importHabitRow(cells({ A: "Doc sach" }), {});
  assert.equal(habit.status, "ok");
  const completion = importHabitCompletion({ rowNumber: 26, cells: { B: "TRUE" } }, "v_habit01", "B", "2026-10-05");
  assert.deepEqual(completion, { lexoraId: "v_habit01", completionDate: "2026-10-05", completed: true });
  const mark = importAttendanceMarkCell(cells({ E: "Toan" }), "2026-10-05", "Muon");
  assert.equal(mark.status, "ok");
  assert.equal((mark.values as { mark: string }).mark, "⏳");
  assert.equal(readAttendanceCourseName(cells({ E: " Toan " })), "Toan");
});

test("grid slicing reads source columns by letter and merges id backfill writes", () => {
  const grid = gridFromPlannerValues({
    tab: "Tab",
    values: [
      [],
      [],
      [],
      [],
      [],
      [],
      ["", "2026-10-05", "Luyen nghe"],
    ],
    dataFrom: 6,
    dataTo: 8,
    columns: ["B", "C"],
  });
  assert.equal(grid.rows.length, 3);
  const merged = metadataWriteRanges("Tab", "AP", [
    { rowNumber: 6, sourceId: "v_a1" },
    { rowNumber: 7, sourceId: "v_a2" },
    { rowNumber: 9, sourceId: "v_a3" },
  ]);
  assert.equal(merged.length, 2, "contiguous rows merge into one range write");
  assert.equal(merged[0].values.length, 2);
});
test("__lexora_id column must be part of the read or repeat sync duplicates rows", () => {
  // Regression: the read column list was sourceColumns + controlColumns only,
  // so row.cells[metadataColumn] was always undefined. importTaskRow then
  // reported no identity, the engine minted a fresh lexoraId on every run,
  // and each webhook INSERTed a new row instead of updating the existing one
  // (observed live: assignments reached 402 rows for a single due date).
  const syncSource = fs.readFileSync("src/lib/studyPlanner/sync.ts", "utf8");
  assert.match(syncSource, /range\.metadataColumn \? \[range\.metadataColumn\] : \[\]/, "metadataColumn must be appended to the read columns");
  const widened = syncSource.match(/metadataColumn \? \[range\.metadataColumn\] : \[\]/g) ?? [];
  assert.ok(widened.length >= 2, "planFor and gridFor must both include the metadata column");
});

test("reading the metadata column preserves identity (behavioral)", () => {
  const { gridFromPlannerValues } = require("@/lib/studyPlanner/columnGrid") as typeof import("@/lib/studyPlanner/columnGrid");
  const { importTaskRow } = require("@/lib/studyPlanner/importers") as typeof import("@/lib/studyPlanner/importers");
  const { WORKBOOK_RANGES } = require("@/lib/studyPlanner/workbookMap") as typeof import("@/lib/studyPlanner/workbookMap");
  const col = WORKBOOK_RANGES["Nhật ký nhiệm vụ"]!.metadataColumn!;
  const existingId = "v_abc123def456";
  const ci = (l: string) => { let i = 0; for (const ch of l.toUpperCase()) i = i * 26 + (ch.charCodeAt(0) - 64); return i - 1; };
  const values = Array.from({ length: 7 }, () => Array(50).fill("")) as unknown as (string | number | boolean | null)[][];
  values[6][ci("B")] = "2026-10-26";
  values[6][ci("H")] = "On tap";
  values[6][ci(col)] = existingId;
  const withCol = gridFromPlannerValues({ tab: "Nhật ký nhiệm vụ", values, dataFrom: 7, dataTo: 7, columns: ["B", "C", "H", col] });
  const ok = importTaskRow(withCol.rows[0], { metadataColumn: col });
  assert.equal(ok.status, "ok");
  assert.equal((ok as any).lexoraId, existingId);
  const noCol = gridFromPlannerValues({ tab: "Nhật ký nhiệm vụ", values, dataFrom: 7, dataTo: 7, columns: ["B", "C", "H"] });
  const stale = importTaskRow(noCol.rows[0], { metadataColumn: col });
  assert.equal((stale as any).lexoraId, "", "without the column in the read, the importer sees no identity; the engine will mint a fresh id");
});
