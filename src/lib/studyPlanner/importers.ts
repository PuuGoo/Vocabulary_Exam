import { fingerprintPlannerRecord } from "@/lib/studyPlanner/fingerprint";
import type { PlannerGridRow } from "@/lib/studyPlanner/columnGrid";
import {
  normalizeAttendanceMark,
  normalizeCheckbox,
  normalizeDate,
  normalizeDurationMinutes,
  normalizeInteger,
  normalizeNumber,
  normalizeText,
  normalizeTimeFraction,
  normalizeWeekday,
  readPlannerSourceIdCell,
} from "@/lib/studyPlanner/values";

/**
 * Phase 4b: per-domain Sheet row importers.
 *
 * One importer per workbook tab. Each returns normalized records that map 1:1
 * to a study_planner_* table, so the DB layer is a plain upsert. Importers are
 * pure and unit-tested: normalization, identity and fingerprinting all come
 * from the shared modules, never re-implemented here.
 *
 * Invariants every importer upholds:
 * - Row number is never identity; `lexoraId` is the hidden __lexora_id column.
 * - A row with no source value at all is `blank` and is not a delete by itself.
 * - An unusable cell (a date that cannot be parsed, a bad number) makes the
 *   row `invalid` with a message, never a silent null overwrite.
 */

export type ImportStatus = "ok" | "blank" | "invalid";

export type ImportResult<T> = {
  status: ImportStatus;
  rowNumber: number;
  lexoraId: string;
  values?: T;
  fingerprint?: string;
  invalidKeys?: string[];
  message?: string;
};

/** Metadata column letters per tab (mirrors workbookMap metadataColumn). */
type ImporterOptions = { metadataColumn?: string };

function readMeta(row: PlannerGridRow, column?: string): string {
  if (!column) return "";
  return readPlannerSourceIdCell(row.cells[column]);
}

function hasAnyValue(row: PlannerGridRow, columns: readonly string[]): boolean {
  return columns.some((letter) => {
    const value = row.cells[letter];
    return value != null && String(value).trim() !== "";
  });
}

// ---------------------------------------------------------------- tasks

export type TaskImport = {
  taskDate: string;
  completed: boolean;
  startTime: number | null;
  endTime: number | null;
  category: string | null;
  ieltsSkill: string | null;
  taskTitle: string;
  priority: string | null;
  durationMinutes: number | null;
  notes: string | null;
  dueDate: string | null;
  compensatingTask: string | null;
  statusText: string | null;
  ieltsMaterial: string | null;
  ieltsTaskType: string | null;
  ieltsBand: number | null;
  ieltsMistakeAnalysis: string | null;
};

/**
 * Nhat ky nhem vu columns (Phase 1.4 map, header row 6, data from row 7):
 * A Ma Task, B Ngay, C Hoan thanh, D Bat dau, E Ket thuc, F Phan loai,
 * G Ky nang IELTS, H Nhiem vu, I Muc uu tien, J Thoi luong, K Ghi chu,
 * L Han chot, M Bu cho Task, N Trang thai (derived -> read only as fallback).
 */
export function importTaskRow(row: PlannerGridRow, options: ImporterOptions = {}): ImportResult<TaskImport> {
  const columns = ["B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M"];
  const lexoraId = readMeta(row, options.metadataColumn);
  if (!hasAnyValue(row, columns)) return { status: "blank", rowNumber: row.rowNumber, lexoraId };
  const taskDate = normalizeDate(row.cells.B);
  const taskTitle = normalizeText(row.cells.H ?? "");
  const invalidKeys: string[] = [];
  if (!taskDate) invalidKeys.push("task_date");
  if (!taskTitle) invalidKeys.push("task_title");
  if (invalidKeys.length) {
    return { status: "invalid", rowNumber: row.rowNumber, lexoraId, invalidKeys, message: `Thiếu hoặc sai: ${invalidKeys.join(", ")}` };
  }
  const values: TaskImport = {
    taskDate: taskDate as string,
    completed: normalizeCheckbox(row.cells.C) ?? false,
    startTime: normalizeTimeFraction(row.cells.D),
    endTime: normalizeTimeFraction(row.cells.E),
    category: row.cells.F ?? null,
    ieltsSkill: row.cells.G ?? null,
    taskTitle,
    priority: row.cells.I ?? null,
    durationMinutes: normalizeDurationMinutes(row.cells.J),
    notes: row.cells.K ?? null,
    dueDate: normalizeDate(row.cells.L),
    compensatingTask: row.cells.M ?? null,
    statusText: row.cells.N ?? null,
    ieltsMaterial: row.cells.O ?? null,
    ieltsTaskType: row.cells.P ?? null,
    ieltsBand: normalizeNumber(row.cells.Q),
    ieltsMistakeAnalysis: row.cells.R ?? null,
  };
  return { status: "ok", rowNumber: row.rowNumber, lexoraId, values, fingerprint: fingerprintPlannerRecord("task", values) };
}


export type IeltsPracticeImport = {
  practiceDate: string;
  skill: string | null;
  material: string;
  taskType: string | null;
  band: number | null;
  mistakeAnalysis: string | null;
};

/**
 * Ke hoach ngay & IELTS (IELTS practice block only, columns I..N).
 *
 * The daily-task lattice on this tab (columns B..G) is formula-generated
 * from Nhat ky nhiem vu and must not be imported a second time: importing
 * it here would duplicate every mirrored task. This importer reads only
 * the user-entered IELTS practice table (I = date, J = skill, K = material,
 * L = task type, M = band, N = mistake analysis); the result feeds the same
 * study_planner_tasks row as a Nhat ky task through the IELTS fields.
 */
export function importIeltsPracticeRow(row: PlannerGridRow, options: ImporterOptions = {}): ImportResult<IeltsPracticeImport> {
  const columns = ["I", "J", "K", "L", "M", "N"];
  const lexoraId = readMeta(row, options.metadataColumn);
  if (!hasAnyValue(row, columns)) return { status: "blank", rowNumber: row.rowNumber, lexoraId };
  const practiceDate = normalizeDate(row.cells.I);
  const material = normalizeText(row.cells.K ?? "");
  const invalidKeys: string[] = [];
  if (!practiceDate) invalidKeys.push("practice_date");
  if (!material) invalidKeys.push("material");
  if (invalidKeys.length) {
    return { status: "invalid", rowNumber: row.rowNumber, lexoraId, invalidKeys, message: "Thieu hoac sai: " + invalidKeys.join(", ") };
  }
  const values: IeltsPracticeImport = {
    practiceDate: practiceDate as string,
    skill: row.cells.J ?? null,
    material,
    taskType: row.cells.L ?? null,
    band: normalizeNumber(row.cells.M),
    mistakeAnalysis: row.cells.N ?? null,
  };
  return { status: "ok", rowNumber: row.rowNumber, lexoraId, values, fingerprint: fingerprintPlannerRecord("task", { task_date: practiceDate, task_title: material, category: "IELTS", ielts_skill: row.cells.J ?? null, ielts_material: material, ielts_task_type: row.cells.L ?? null, ielts_band: normalizeNumber(row.cells.M), ielts_mistake_analysis: row.cells.N ?? null }) };
}

// ------------------------------------------------------- courses/sessions

export type CourseImport = {
  courseName: string;
  courseCode: string | null;
  lecturer: string | null;
  credits: number | null;
  notes: string | null;
  score: number | null;
  gradePoint: number | null;
};

/** Thong tin lop hoc A7:F -- A Mon, B Ma mon, C Giang vien, D Tin chi, E Ghi chu, F Diem. */
export function importCourseRow(row: PlannerGridRow, options: ImporterOptions = {}): ImportResult<CourseImport> {
  const columns = ["A", "B", "C", "D", "E", "F"];
  const lexoraId = readMeta(row, options.metadataColumn);
  if (!hasAnyValue(row, columns)) return { status: "blank", rowNumber: row.rowNumber, lexoraId };
  const courseName = normalizeText(row.cells.A ?? "");
  if (!courseName) return { status: "invalid", rowNumber: row.rowNumber, lexoraId, invalidKeys: ["course_name"], message: "Thiếu tên môn học" };
  const values: CourseImport = {
    courseName,
    courseCode: row.cells.B ?? null,
    lecturer: row.cells.C ?? null,
    credits: normalizeInteger(row.cells.D),
    notes: row.cells.E ?? null,
    score: normalizeNumber(row.cells.F),
    gradePoint: normalizeNumber(row.cells.G),
  };
  return { status: "ok", rowNumber: row.rowNumber, lexoraId, values, fingerprint: fingerprintPlannerRecord("course", values) };
}

export type SessionImport = {
  weekday: number;
  startTime: number;
  endTime: number;
  room: string | null;
};

/**
 * Thong tin lop hoc schedule lattice G7:L, one (Thu, Gio) cell per session.
 * Called once per session cell, not per row.
 */
export function importSessionCell(row: PlannerGridRow, weekdayCell: unknown, startCell: unknown, endCell: unknown, roomCell: unknown): ImportResult<SessionImport> {
  const weekday = normalizeWeekday(weekdayCell);
  const startTime = normalizeTimeFraction(startCell);
  const endTime = normalizeTimeFraction(endCell);
  if (weekday == null || startTime == null || endTime == null) {
    return { status: "invalid", rowNumber: row.rowNumber, lexoraId: "", invalidKeys: ["weekday", "start_time", "end_time"], message: "Buổi học thiếu thứ hoặc giờ" };
  }
  const values: SessionImport = { weekday, startTime, endTime, room: roomCell == null || normalizeText(roomCell) === "" ? null : normalizeText(roomCell) };
  return { status: "ok", rowNumber: row.rowNumber, lexoraId: "", values, fingerprint: fingerprintPlannerRecord("session", values) };
}

// ------------------------------------------------------- curriculum

export type CurriculumImport = {
  subject: string;
  topic: string;
  expectedWeek: number | null;
  statusText: string | null;
  completed: boolean;
  notes: string | null;
};

/** Quan ly giao trinh A5:F -- A Mon, B Chuong/Chu de, C Tuan du kien, D status, E Hoan thanh, F Ghi chu. */
export function importCurriculumRow(row: PlannerGridRow, options: ImporterOptions = {}): ImportResult<CurriculumImport> {
  const columns = ["A", "B", "C", "D", "E", "F"];
  const lexoraId = readMeta(row, options.metadataColumn);
  if (!hasAnyValue(row, columns)) return { status: "blank", rowNumber: row.rowNumber, lexoraId };
  const subject = normalizeText(row.cells.A ?? "");
  const topic = normalizeText(row.cells.B ?? "");
  if (!subject || !topic) {
    const invalidKeys = [!subject ? "subject" : null, !topic ? "topic" : null].filter(Boolean) as string[];
    return { status: "invalid", rowNumber: row.rowNumber, lexoraId, invalidKeys, message: `Thiếu: ${invalidKeys.join(", ")}` };
  }
  const values: CurriculumImport = {
    subject,
    topic,
    expectedWeek: normalizeInteger(row.cells.C),
    statusText: row.cells.D ?? null,
    completed: normalizeCheckbox(row.cells.E) ?? false,
    notes: row.cells.F ?? null,
  };
  return { status: "ok", rowNumber: row.rowNumber, lexoraId, values, fingerprint: fingerprintPlannerRecord("curriculum", values) };
}

// ------------------------------------------------------- assignments

export type AssignmentImport = {
  subject: string | null;
  description: string;
  category: string | null;
  statusText: string | null;
  durationHours: number | null;
  dueTime: number | null;
  dueDate: string | null;
  notes: string | null;
  grade: string | null;
};

/** Bang theo doi bai tap A5:J -- A Mon, B Mo ta, C Phan loai, D Trang thai, E Thoi luong, F Gio nop, G Ngay nop, H Ghi chu, I Diem. */
export function importAssignmentRow(row: PlannerGridRow, options: ImporterOptions = {}): ImportResult<AssignmentImport> {
  const columns = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
  const lexoraId = readMeta(row, options.metadataColumn);
  if (!hasAnyValue(row, columns)) return { status: "blank", rowNumber: row.rowNumber, lexoraId };
  const description = normalizeText(row.cells.B ?? "");
  if (!description) return { status: "invalid", rowNumber: row.rowNumber, lexoraId, invalidKeys: ["description"], message: "Thiếu mô tả bài tập" };
  const values: AssignmentImport = {
    subject: row.cells.A ?? null,
    description,
    category: row.cells.C ?? null,
    statusText: row.cells.D ?? null,
    durationHours: normalizeNumber(row.cells.E),
    dueTime: normalizeTimeFraction(row.cells.F),
    dueDate: normalizeDate(row.cells.G),
    notes: row.cells.H ?? null,
    grade: row.cells.I ?? null,
  };
  return { status: "ok", rowNumber: row.rowNumber, lexoraId, values, fingerprint: fingerprintPlannerRecord("assignment", values) };
}

// ------------------------------------------------------- reading

export type ReadingImport = {
  subject: string;
  title: string;
  author: string | null;
  targetPages: number | null;
  currentPage: number | null;
  totalPages: number | null;
  notes: string | null;
};

/** Danh sach tai lieu doc A5:H -- A Mon, B Ten, C Tac gia, D Trang can doc, E Trang hien tai, F Tong, G progress, H Ghi chu. */
export function importReadingRow(row: PlannerGridRow, options: ImporterOptions = {}): ImportResult<ReadingImport> {
  const columns = ["A", "B", "C", "D", "E", "F", "H"];
  const lexoraId = readMeta(row, options.metadataColumn);
  if (!hasAnyValue(row, columns)) return { status: "blank", rowNumber: row.rowNumber, lexoraId };
  const subject = normalizeText(row.cells.A ?? "");
  const title = normalizeText(row.cells.B ?? "");
  if (!subject || !title) {
    const invalidKeys = [!subject ? "subject" : null, !title ? "title" : null].filter(Boolean) as string[];
    return { status: "invalid", rowNumber: row.rowNumber, lexoraId, invalidKeys, message: `Thiếu: ${invalidKeys.join(", ")}` };
  }
  const values: ReadingImport = {
    subject,
    title,
    author: row.cells.C ?? null,
    targetPages: normalizeInteger(row.cells.D),
    currentPage: normalizeInteger(row.cells.E),
    totalPages: normalizeInteger(row.cells.F),
    notes: row.cells.H ?? null,
  };
  return { status: "ok", rowNumber: row.rowNumber, lexoraId, values, fingerprint: fingerprintPlannerRecord("reading", values) };
}

// ------------------------------------------------------- todos

export type TodoImport = {
  taskTitle: string;
  category: string | null;
  priority: string | null;
  dueDate: string | null;
  notes: string | null;
  completed: boolean;
};

/** Danh sach viec can lam A5:G -- A Xong, B Viec, C Danh muc, D Uu tien, E Han, F Con lai, G Ghi chu. */
export function importTodoRow(row: PlannerGridRow, options: ImporterOptions = {}): ImportResult<TodoImport> {
  const columns = ["A", "B", "C", "D", "E", "G"];
  const lexoraId = readMeta(row, options.metadataColumn);
  if (!hasAnyValue(row, columns)) return { status: "blank", rowNumber: row.rowNumber, lexoraId };
  const taskTitle = normalizeText(row.cells.B ?? "");
  if (!taskTitle) return { status: "invalid", rowNumber: row.rowNumber, lexoraId, invalidKeys: ["task_title"], message: "Thiếu nội dung việc cần làm" };
  const values: TodoImport = {
    taskTitle,
    completed: normalizeCheckbox(row.cells.A) ?? false,
    category: row.cells.C ?? null,
    priority: row.cells.D ?? null,
    dueDate: normalizeDate(row.cells.E),
    notes: row.cells.G ?? null,
  };
  return { status: "ok", rowNumber: row.rowNumber, lexoraId, values, fingerprint: fingerprintPlannerRecord("todo", values) };
}

// ------------------------------------------------------- activities

export type ActivityImport = {
  activityDate: string;
  startTime: number | null;
  endTime: number | null;
  activityName: string;
  activityType: string | null;
  notes: string | null;
};

/** Hoat dong A3:F -- A Ngay, B Bat dau, C Ket thuc, D Hoat dong, E Loai, F Ghi chu. */
export function importActivityRow(row: PlannerGridRow, options: ImporterOptions = {}): ImportResult<ActivityImport> {
  const columns = ["A", "B", "C", "D", "E", "F"];
  const lexoraId = readMeta(row, options.metadataColumn);
  if (!hasAnyValue(row, columns)) return { status: "blank", rowNumber: row.rowNumber, lexoraId };
  const activityDate = normalizeDate(row.cells.A);
  const activityName = normalizeText(row.cells.D ?? "");
  const invalidKeys: string[] = [];
  if (!activityDate) invalidKeys.push("activity_date");
  if (!activityName) invalidKeys.push("activity_name");
  if (invalidKeys.length) return { status: "invalid", rowNumber: row.rowNumber, lexoraId, invalidKeys, message: `Thiếu hoặc sai: ${invalidKeys.join(", ")}` };
  const values: ActivityImport = {
    activityDate: activityDate as string,
    startTime: normalizeTimeFraction(row.cells.B),
    endTime: normalizeTimeFraction(row.cells.C),
    activityName,
    activityType: row.cells.E ?? null,
    notes: row.cells.F ?? null,
  };
  return { status: "ok", rowNumber: row.rowNumber, lexoraId, values, fingerprint: fingerprintPlannerRecord("activity", values) };
}

// ------------------------------------------------------- habits

export type HabitImport = { name: string };

/** Habit Tracker: habit name lives in column A of the habit block (rows 26+). */
export function importHabitRow(row: PlannerGridRow, options: ImporterOptions = {}): ImportResult<HabitImport> {
  const lexoraId = readMeta(row, options.metadataColumn);
  const name = normalizeText(row.cells.A ?? "");
  if (!name) return { status: "blank", rowNumber: row.rowNumber, lexoraId };
  return { status: "ok", rowNumber: row.rowNumber, lexoraId, values: { name }, fingerprint: fingerprintPlannerRecord("habit", { name }) };
}

/**
 * Habit daily completion is a wide grid, not a row. The grid cell at column
 * (day index) of the habit's row is the completion for that calendar date.
 * Identity is habit lexoraId + real ISO date, never the grid position.
 */
export function importHabitCompletion(row: PlannerGridRow, habitLexoraId: string, dayColumn: string, date: string): { lexoraId: string; completionDate: string; completed: boolean } | null {
  const checked = normalizeCheckbox(row.cells[dayColumn]);
  if (checked == null) return null;
  return { lexoraId: habitLexoraId, completionDate: date, completed: checked };
}

// ------------------------------------------------------- attendance

export type AttendanceMarkImport = { sessionDate: string; mark: string };

/**
 * Bang theo doi chuyen can: row = course (column E), columns F..AI = weekly
 * sessions whose real dates live in derived row 4. The mark cell is read per
 * (course, session date) -- moving a session column never creates a new course.
 */
export function importAttendanceMarkCell(courseRow: PlannerGridRow, sessionDate: string, markCell: unknown): ImportResult<AttendanceMarkImport> {
  const mark = normalizeAttendanceMark(markCell);
  if (mark == null) return { status: "blank", rowNumber: courseRow.rowNumber, lexoraId: "" };
  return { status: "ok", rowNumber: courseRow.rowNumber, lexoraId: "", values: { sessionDate, mark } };
}

/** Course label for an attendance row (column E). */
export function readAttendanceCourseName(row: PlannerGridRow): string {
  return normalizeText(row.cells.E ?? "");
}

/** Re-exported so importers and the DB layer share one date helper. */
export { normalizeDate };
