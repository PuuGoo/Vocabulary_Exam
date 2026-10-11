import assert from "node:assert/strict";
import test from "node:test";

import {
  ATTENDANCE_DATE_ROW,
  ATTENDANCE_SESSION_COLUMNS,
  attendanceSessionColumns,
  HABIT_CONTROL_CELLS,
  plannerControlValues,
  plannerMonthFromControls,
  plannerSessionKey,
  SEMESTER_CONTROL_CELLS,
  TARGET_IELTS_CELL,
} from "@/lib/studyPlanner/syncPlannerGridDomains";
import { gridFromPlannerValues } from "@/lib/studyPlanner/columnGrid";
import { WORKBOOK_RANGES } from "@/lib/studyPlanner/workbookMap";
import { importIeltsPracticeRow } from "@/lib/studyPlanner/importers";

/**
 * Phase 4.2 grid-domain tests, all verified against the real owner workbook.
 *
 * The fixtures mirror the real layout (control cells above the data block,
 * the schedule lattice in G..K, session dates in row 6, month controls in
 * B3/B4) so an off-by-one-row or off-by-one-column regression fails here
 * instead of silently importing the wrong cells in production.
 */

test("semester and habit controls read the cells above the data blocks", () => {
  const courseInfo = [
    [],
    [],
    ["", 46258],
    ["", 46362],
  ];
  const habit = [
    [],
    [],
    ["", 2026],
    ["", 10],
  ];
  const planner = [
    [],
    [],
    ["", "", "", "", "", "", "", "", "", "", "", "", "7.5 Overall"],
    [],
  ];
  const valuesByTab = new Map([
    ["Thông tin lớp học", courseInfo],
    ["Habit Tracker", habit],
    ["Kế hoạch ngày & IELTS", planner],
  ]);
  assert.equal(SEMESTER_CONTROL_CELLS.semesterStart, "B3");
  assert.equal(SEMESTER_CONTROL_CELLS.semesterEnd, "B4");
  assert.equal(HABIT_CONTROL_CELLS.habitYear, "B3");
  assert.equal(HABIT_CONTROL_CELLS.habitMonth, "B4");
  assert.equal(TARGET_IELTS_CELL, "M3");
  const controls = plannerControlValues(valuesByTab);
  assert.equal(controls.semesterStart, 46258);
  assert.equal(controls.semesterEnd, 46362);
  assert.equal(controls.habitYear, 2026);
  assert.equal(controls.habitMonth, 10);
  assert.equal(controls.targetIelts, "7.5 Overall");
  assert.equal(plannerMonthFromControls(controls.habitYear, controls.habitMonth), "2026-10");
});

test("month selection falls back to the planner-local month on bad controls", () => {
  assert.match(plannerMonthFromControls(undefined, undefined), /^\d{4}-\d{2}$/);
  assert.equal(plannerMonthFromControls(2026, 13).slice(0, 4), "2026");
});

test("attendance dates come from the derived header row, deduped by real date", () => {
  const header = new Array(35).fill(null);
  header[5] = 46258;
  header[6] = 46265;
  header[7] = 46265;
  const columns = attendanceSessionColumns([[], [], [], [], [], header]);
  assert.equal(ATTENDANCE_DATE_ROW, 6);
  assert.equal(ATTENDANCE_SESSION_COLUMNS[0], "F");
  assert.ok(columns.length >= 1);
  assert.equal(columns[0].column, "F");
  assert.equal(columns[1].column, "G");
  assert.ok(!columns.some((entry) => entry.column === "H"), "a duplicate session date must not create a second session");
});

test("a course name resolves through the timetable column, not the course row", () => {
  const grid = gridFromPlannerValues({
    tab: "Thông tin lớp học",
    values: [
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      ["", "", "", "", "", "", "Toán cao cấp", "Thứ Hai", 0.3125, 0.39583333, "A101"],
    ],
    dataFrom: 10,
    dataTo: 10,
    columns: ["G", "H", "I", "J", "K"],
  });
  const row = grid.rows[0];
  assert.equal(row.cells.G, "Toán cao cấp");
  assert.equal(row.cells.H, "Thứ Hai");
});

test("session identity is (course, weekday, start): reordering rows never duplicates", () => {
  const morning = plannerSessionKey(12, 1, 0.3125);
  const same = plannerSessionKey(12, 1, 0.3125);
  const afternoon = plannerSessionKey(12, 1, 0.54166667);
  const otherCourse = plannerSessionKey(13, 1, 0.3125);
  assert.equal(morning, same);
  assert.notEqual(morning, afternoon);
  assert.notEqual(morning, otherCourse);
  assert.match(morning, /^v_s[0-9a-z]{6,}$/);
});

test("the IELTS block reads only columns I..N, never the mirrored task lattice", () => {
  const ok = importIeltsPracticeRow(
    {
      rowNumber: 7,
      cells: {
        B: "",
        C: "",
        I: "2026-09-28",
        J: "Listening",
        K: "Cambridge IELTS 18 Test 1",
        L: "Section 1",
        M: "7.5",
        N: "Lỗi chính tả",
      },
    },
    {},
  );
  assert.equal(ok.status, "ok");
  const mirroredOnly = importIeltsPracticeRow(
    { rowNumber: 8, cells: { B: "x", C: "y", I: "", J: "", K: "", L: "", M: "", N: "" } },
    {},
  );
  assert.equal(mirroredOnly.status, "blank");
});

test("attendance and habit ranges leave their formula neighbours writable-safe", () => {
  const attendance = WORKBOOK_RANGES["Bảng theo dõi chuyên cần"];
  assert.ok(attendance);
  assert.ok(attendance.sourceColumns.includes("A"));
  assert.ok(!attendance.sourceColumns.includes("B"));
  assert.equal(attendance.dataFrom, 7);
  const habit = WORKBOOK_RANGES["Habit Tracker"];
  assert.ok(habit);
  const used = new Set(habit.sourceColumns);
  // BP is the first column outside AG..BO formula fringe.
  assert.equal(habit.metadataColumn, "BP");
  assert.ok(!used.has("AS"), "AS carries formulas in the real workbook and must not store ids");
  assert.ok(!used.has("BP"));
});
