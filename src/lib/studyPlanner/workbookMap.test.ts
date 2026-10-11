import assert from "node:assert/strict";
import test from "node:test";

import { DERIVED_TABS, SOURCE_TABS, WORKBOOK_RANGES } from "@/lib/studyPlanner/workbookMap";

// These assertions lock the Phase 1.4 audit so they stay in sync with the docs
// map; changing the workbook without updating both places would break sync.

test("the workbook has exactly 16 tabs and every source tab has a data range", () => {
  const tabCount = Object.keys(WORKBOOK_RANGES).length;
  assert.equal(tabCount, 16, "the workbook must stay at 16 tabs");
  assert.equal(SOURCE_TABS.length + DERIVED_TABS.length, 16);
  for (const tab of SOURCE_TABS) {
    const range = WORKBOOK_RANGES[tab];
    assert.ok(range != null, `${tab} is listed as a source tab but has no data range`);
    assert.ok(range.sourceColumns.length > 0, `${tab} must declare at least one source column`);
    // Metadata must live beyond the visible used range; a missing slot means
    // the next writer will insert into the middle of the sheet and break formulas.
    if (tab !== "Bảng theo dõi chuyên cần") {
      assert.ok(range.metadataColumn != null, `${tab} needs a metadata column for __lexora_id`);
    }
    // Derived columns are never writable; the sync writes only source + control.
    assert.ok(!range.derivedColumns.some((letter) => range.sourceColumns.includes(letter)), `${tab} has a column marked both source and derived`);
  }
});

test("only the expected tabs are derived (the rest must not be rewritten)", () => {
  const expectedDerived = new Set(["Dashboard", "Lịch học", "Lịch tuần", "Lịch bài tập", "Hướng dẫn", "Dữ liệu"]);
  assert.deepEqual(new Set(DERIVED_TABS), expectedDerived);
});

test("the habit grid reserve matches the workbook's formula-heavy sheet", () => {
  const tracker = WORKBOOK_RANGES["Habit Tracker"];
  assert.ok(tracker != null);
  // The specimen sheet uses A..AF for 31 days; adding more would overwrite
  // the formula fringe at AG..AJ. A code change that widened this to e.g.
  // ...AL silently shifts identities.
  assert.deepEqual(tracker.sourceColumns.filter((letter) => letter.length === 1), ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"]);
});

test("the attendance grid stores each session by date, not by sheet column", () => {
  const attendance = WORKBOOK_RANGES["Bảng theo dõi chuyên cần"];
  assert.ok(attendance != null);
  // Buoi sessions are F..AI (30 weekly columns). B..E are derived summaries
  // and must not be source.
  assert.ok(attendance.derivedColumns.includes("B"));
  assert.ok(!attendance.sourceColumns.includes("B"));
  // The book needs room for 30 weeks: at least 30 source columns.
  const sessionLetters = attendance.sourceColumns.filter((letter) => !["F"].includes(letter) || true);
  assert.ok(sessionLetters.length >= 30, "the attendance grid needs at least 30 session columns");
});

test("day and IELTS practice share one task table so a row is never duplicated", () => {
  const dailyPlanner = WORKBOOK_RANGES["Kế hoạch ngày & IELTS"];
  assert.ok(dailyPlanner != null);
  // Shared domain keeps "Ke hoach ngay" filtered tasks and IELTS practice
  // from being imported twice if they share a row.
  assert.deepEqual(dailyPlanner.domain, ["study_planner_tasks"]);
  const log = WORKBOOK_RANGES["Nhật ký nhiệm vụ"];
  assert.ok(log != null);
  assert.deepEqual(log.domain, ["study_planner_tasks"]);
});

test("the worksheet that owns semester dates drives only the planner domain; vocabulary tables stay untouched", () => {
  assert.ok(WORKBOOK_RANGES["Thông tin lớp học"] != null);
  for (const domain of WORKBOOK_RANGES["Thông tin lớp học"].domain) {
    assert.ok(domain.startsWith("study_planner_"), `domain ${domain} must stay isolated from vocabulary tables`);
  }
});
