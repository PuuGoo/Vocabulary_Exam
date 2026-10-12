/**
 * Phase 1.4 verified source-of-truth map for the owner workbook.
 *
 * Every tab and range is classified so the sync engine never overwrites a
 * derived cell, a chart, or a control the user did not mean to change.
 * Derived from the real xlsx via audit-study-planner-workbook.mjs; keep it
 * in sync with docs/study-planner-workbook-map.md.
 *
 * Coordinates are 1-based sheet row / 0-based column letter, Asia/Ho_Chi_Minh
 * date handling is owned by values.ts, not by this map.
 */

export type WorkbookTab =
  | "Dashboard"
  | "Kế hoạch ngày & IELTS"
  | "Nhật ký nhiệm vụ"
  | "Thông tin lớp học"
  | "Lịch học"
  | "Lịch tuần"
  | "Quản lý giáo trình"
  | "Bảng theo dõi bài tập"
  | "Lịch bài tập"
  | "Danh sách tài liệu đọc"
  | "Bảng theo dõi chuyên cần"
  | "Habit Tracker"
  | "Danh sách việc cần làm"
  | "Hoạt động"
  | "Hướng dẫn"
  | "Dữ liệu";

export type CellClass = "source" | "control" | "derived" | "presentation" | "metadata";

export type WorkbookRange = {
  /** A1 of the header row, e.g. "A4". Only present when the range has a header. */
  headerA1?: string;
  /** First data row (1-based). */
  dataFrom: number;
  /** Last data row or null when unbounded (up to the next bleed-through). */
  dataTo: number | null;
  /** Columns that are editable source data for this domain. */
  sourceColumns: string[];
  /** Columns that are editable controls (year/month, etc.). Empty when none. */
  controlColumns?: string[];
  /** Columns that are computed and must never be overwritten. */
  derivedColumns: string[];
  /** Where the hidden __lexora_id lives (outside the visible used range). */
  metadataColumn?: string;
  /** Which Postgres table(s) this range feeds. */
  domain: string[];
};

/**
 * Mapping for every tab. Tabs not listed as sources have no data range —
 * Dashboard, Lich hoc/week, Lich deadline and Du lieu are pure derived
 * views; Huong dan is static help. Ke hoach ngay & IELTS has two blocks on
 * one sheet and is described below as top metrics (derived) + data table
 * (source, row 6 onward).
 */
export const WORKBOOK_RANGES: Record<WorkbookTab, WorkbookRange | null> = {
  "Dashboard": null,
  "Kế hoạch ngày & IELTS": {
    // Only the user-entered IELTS practice table (I..N) is source data.
    // Columns B..G are LET/FILTER/HSTACK formulas that mirror
    // "Nhật ký nhiệm vụ": importing or writing them would duplicate
    // every task and overwrite the workbook's own daily-plan formula.
    headerA1: "I6",
    dataFrom: 7,
    dataTo: 1000,
    sourceColumns: ["I", "J", "K", "L", "M", "N"],
    controlColumns: [],
    // B..G daily-plan lattice + the B2..M4 metric strip are all computed.
    derivedColumns: ["A", "B", "C", "D", "E", "F", "G", "H"],
    metadataColumn: "AN",
    domain: ["study_planner_tasks"],
  },
  "Nhật ký nhiệm vụ": {
    headerA1: "A6",
    dataFrom: 7,
    dataTo: 991,
    // Read set: B..N. A, J, L and N hold live formulas (task code, duration,
    // deadline mirror, status). They are read as evaluated values because
    // they carry real user intent, but they are listed in derivedColumns so
    // the web write path can never overwrite the formula itself.
    sourceColumns: ["B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"],
    controlColumns: [],
    derivedColumns: ["A", "J", "L", "N"],
    metadataColumn: "AP",
    domain: ["study_planner_tasks"],
  },
  "Thông tin lớp học": {
    // Two regions under one tab: semester controls (B2:B3, courses A7:F) +
    // schedule lattice G7:L (Thu / Gio). Modeled as one range; the sync
    // layer splits them logically and writes to disjoint columns, so legacy
    // semesters are never truncated.
    headerA1: "A9",
    dataFrom: 10,
    dataTo: 205,
    sourceColumns: ["A", "B", "C", "D", "E", "G", "H", "I", "J", "K"],
    controlColumns: ["B"], // B2/B3 semester dates land here via settings table.
    derivedColumns: [],
    metadataColumn: "AR",
    domain: ["study_planner_settings", "study_planner_courses", "study_planner_course_sessions"],
  },
  "Lịch học": null,
  "Lịch tuần": null,
  "Quản lý giáo trình": {
    headerA1: "A4",
    dataFrom: 5,
    dataTo: 204,
    sourceColumns: ["A", "B", "C", "E", "F"],
    derivedColumns: ["D", "H", "I", "J", "K", "L"],
    metadataColumn: "AR",
    domain: ["study_planner_curriculum_topics"],
  },
  "Bảng theo dõi bài tập": {
    headerA1: "A22",
    dataFrom: 23,
    dataTo: 202,
    sourceColumns: ["A", "B", "C", "D", "E", "F", "G", "I", "J"],
    derivedColumns: ["H", "K"],
    metadataColumn: "AQ",
    domain: ["study_planner_assignments"],
  },
  "Lịch bài tập": null,
  "Danh sách tài liệu đọc": {
    headerA1: "A4",
    dataFrom: 5,
    dataTo: 300,
    sourceColumns: ["A", "B", "C", "D", "E", "F", "H"],
    derivedColumns: ["G", "I"],
    metadataColumn: "AR",
    domain: ["study_planner_reading_materials"],
  },
  "Bảng theo dõi chuyên cần": {
    // Grid: columns F..AI are Buoi sessions; dates live in row 6 derived as
    // B2+7*n. No hidden column: session identity is (lexora_id + real date).
    headerA1: "A6",
    dataFrom: 7,
    dataTo: 205,
    sourceColumns: ["A", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "AA", "AB", "AC", "AD", "AE", "AF", "AG", "AH", "AI"],
    controlColumns: [],
    derivedColumns: ["B", "C", "D", "E"],
    metadataColumn: undefined,
    domain: ["study_planner_attendance_sessions", "study_planner_attendance_marks"],
  },
  "Habit Tracker": {
    // Wide 31-day grid A..AF per day. One habit per row A26:A40 in the
    // specimen; the sheet reserves A24..BO40 with 627 formulas so writes must
    // stay inside A..AF for source cells.
    headerA1: "A24",
    dataFrom: 26,
    dataTo: 140,
    sourceColumns: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "AA", "AB", "AC", "AD", "AE", "AF"],
    controlColumns: ["B"], // B2/B3 year/month land here via settings.
    derivedColumns: ["AG", "AH", "AI", "AJ", "AK"],
    metadataColumn: "BP",
    domain: ["study_planner_habits", "study_planner_habit_completions"],
  },
  "Danh sách việc cần làm": {
    headerA1: "A6",
    dataFrom: 7,
    dataTo: 205,
    sourceColumns: ["A", "B", "C", "D", "E", "G"],
    derivedColumns: ["F"],
    metadataColumn: "AQ",
    domain: ["study_planner_todos"],
  },
  "Hoạt động": {
    headerA1: "A4",
    dataFrom: 5,
    dataTo: 400,
    sourceColumns: ["A", "B", "C", "D", "E", "F"],
    derivedColumns: [],
    metadataColumn: "AQ",
    domain: ["study_planner_activities"],
  },
  "Hướng dẫn": null,
  "Dữ liệu": null,
};

/**
 * Columns a web edit may actually write on this tab.
 *
 * A workbook column can be readable source data AND a live formula owned by
 * the workbook itself (e.g. Nhat ky J/L/N: task duration, deadline mirror,
 * status). Those are legitimately *read* as evaluated values, but a web
 * write must never overwrite the formula: the write-safe set is
 * sourceColumns + controlColumns MINUS derivedColumns. Coordinate, the
 * write queue and every mutation call this so the rule lives in one place.
 */
export function plannerWritableColumns(range: WorkbookRange): Set<string> {
  return new Set([...range.sourceColumns, ...(range.controlColumns ?? [])].filter((letter) => !range.derivedColumns.includes(letter)));
}

/** Every source-phase tab drives a table; derived ones do not. */
export const SOURCE_TABS: WorkbookTab[] = (Object.keys(WORKBOOK_RANGES) as WorkbookTab[]).filter(
  (tab) => WORKBOOK_RANGES[tab] != null,
);

export const DERIVED_TABS: WorkbookTab[] = (Object.keys(WORKBOOK_RANGES) as WorkbookTab[]).filter(
  (tab) => WORKBOOK_RANGES[tab] == null,
);
