import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  studyPlannerAttendanceMarks,
  studyPlannerAttendanceSessions,
  studyPlannerCourseSessions,
  studyPlannerHabitCompletions,
  studyPlannerHabits,
  studyPlannerSettings,
} from "@/db/schema";
import { generateSourceId } from "@/lib/googleSheets/identity";
import { columnIndexFromLetter, type PlannerGrid, type PlannerGridRow } from "@/lib/studyPlanner/columnGrid";
import { importHabitCompletion, importHabitRow, importSessionCell } from "@/lib/studyPlanner/importers";
import { ATTENDANCE_MARKS, normalizeDate, normalizeText, todayLocal } from "@/lib/studyPlanner/values";
import type { SheetsValue } from "@/lib/googleSheets/api";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type GridDomainResult = {
  created: number;
  updated: number;
  unchanged: number;
  invalid: number;
  idWrites: Array<{ rowNumber: number; sourceId: string }>;
};

function empty(): GridDomainResult {
  return { created: 0, updated: 0, unchanged: 0, invalid: 0, idWrites: [] };
}

function merge(target: GridDomainResult, source: GridDomainResult): void {
  target.created += source.created;
  target.updated += source.updated;
  target.unchanged += source.unchanged;
  target.invalid += source.invalid;
  target.idWrites.push(...source.idWrites);
}

/**
 * Editable control cells only: the semester dates ("Thong tin lop hoc" B3/B4),
 * the Habit Tracker year/month (B3/B4) and the IELTS target. Every derived
 * cell around them (durations, week counts, summaries) is never written.
 */
export async function syncPlannerSettings(
  tx: Tx,
  connectionId: number,
  controls: { semesterStart?: unknown; semesterEnd?: unknown; habitYear?: unknown; habitMonth?: unknown; targetIelts?: unknown },
): Promise<GridDomainResult> {
  const result = empty();
  const [existing] = await tx.select().from(studyPlannerSettings).where(eq(studyPlannerSettings.connectionId, connectionId)).limit(1);
  const year = Number(normalizeText(controls.habitYear));
  const month = Number(normalizeText(controls.habitMonth));
  const next = {
    semesterStart: normalizeDate(controls.semesterStart) ?? existing?.semesterStart ?? null,
    semesterEnd: normalizeDate(controls.semesterEnd) ?? existing?.semesterEnd ?? null,
    selectedYear: Number.isInteger(year) && year > 2000 && year < 3000 ? year : existing?.selectedYear ?? null,
    selectedMonth: Number.isInteger(month) && month >= 1 && month <= 12 ? month : existing?.selectedMonth ?? null,
    targetIelts: controls.targetIelts != null ? normalizeText(controls.targetIelts) || null : existing?.targetIelts ?? null,
  };
  if (existing) {
    const changed =
      String(existing.semesterStart ?? "") !== String(next.semesterStart ?? "") ||
      String(existing.semesterEnd ?? "") !== String(next.semesterEnd ?? "") ||
      existing.selectedYear !== next.selectedYear ||
      existing.selectedMonth !== next.selectedMonth ||
      (existing.targetIelts ?? null) !== next.targetIelts;
    if (!changed) {
      result.unchanged += 1;
      return result;
    }
    await tx.update(studyPlannerSettings).set({ ...next, updatedAt: new Date() }).where(eq(studyPlannerSettings.connectionId, connectionId));
    result.updated += 1;
    return result;
  }
  await tx.insert(studyPlannerSettings).values({ connectionId, ...next });
  result.created += 1;
  return result;
}

/** Month currently selected by the workbook controls, defaulting to today. */
export function plannerMonthFromControls(year: unknown, month: unknown): string {
  const now = todayLocal();
  const parsedYear = Number(normalizeText(year));
  const parsedMonth = Number(normalizeText(month));
  const y = Number.isInteger(parsedYear) && parsedYear > 2000 && parsedYear < 3000 ? parsedYear : Number(now.slice(0, 4));
  const m = Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12 ? parsedMonth : Number(now.slice(5, 7));
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Control cells of "Thong tin lop hoc" (rows 3-4) and "Habit Tracker" (rows 3-4). */
export const SEMESTER_CONTROL_CELLS = { semesterStart: "B3", semesterEnd: "B4" } as const;
export const HABIT_CONTROL_CELLS = { habitYear: "B3", habitMonth: "B4" } as const;
/** "Ke hoach ngay & IELTS" M3 holds the user's target band. */
export const TARGET_IELTS_CELL = "M3" as const;

function cellAt(values: SheetsValue | undefined, a1: string): unknown {
  if (!values) return undefined;
  const match = /^([A-Z]+)(\d+)$/.exec(a1.toUpperCase());
  if (!match) return undefined;
  const index = columnIndexFromLetter(match[1]);
  const rowNumber = Number(match[2]);
  return values[rowNumber - 1]?.[index];
}

/**
 * Read the editable control cells out of the raw tab values.
 *
 * The control cells live ABOVE the data block (rows 3-4), so the data grid
 * never sees them: the sync layer reads them straight from the values matrix.
 */
export function plannerControlValues(valuesByTab: ReadonlyMap<string, SheetsValue | undefined>): {
  semesterStart: unknown;
  semesterEnd: unknown;
  habitYear: unknown;
  habitMonth: unknown;
  targetIelts: unknown;
} {
  const courseInfo = valuesByTab.get("Thông tin lớp học");
  const habit = valuesByTab.get("Habit Tracker");
  const planner = valuesByTab.get("Kế hoạch ngày & IELTS");
  return {
    semesterStart: cellAt(courseInfo, SEMESTER_CONTROL_CELLS.semesterStart),
    semesterEnd: cellAt(courseInfo, SEMESTER_CONTROL_CELLS.semesterEnd),
    habitYear: cellAt(habit, HABIT_CONTROL_CELLS.habitYear),
    habitMonth: cellAt(habit, HABIT_CONTROL_CELLS.habitMonth),
    targetIelts: cellAt(planner, TARGET_IELTS_CELL),
  };
}

/** Attendance session columns F..AI paired with the real date in header row 6. */
export const ATTENDANCE_SESSION_COLUMNS = [
  "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
  "AA", "AB", "AC", "AD", "AE", "AF", "AG", "AH", "AI",
] as const;

/** Header row that carries the real session dates of the attendance grid. */
export const ATTENDANCE_DATE_ROW = 6;

export function attendanceSessionColumns(values: SheetsValue | undefined): Array<{ column: string; date: string }> {
  const header = values?.[ATTENDANCE_DATE_ROW - 1];
  if (!Array.isArray(header)) return [];
  const columns: Array<{ column: string; date: string }> = [];
  const seen = new Set<string>();
  for (const column of ATTENDANCE_SESSION_COLUMNS) {
    const date = normalizeDate(header[columnIndexFromLetter(column)]);
    // A duplicate date means two columns point at the same real session; keep
    // the first so one session never gets two history rows.
    if (!date || seen.has(date)) continue;
    seen.add(date);
    columns.push({ column, date });
  }
  return columns;
}

/**
 * Deterministic identity for a timetable slot.
 *
 * The schedule block has no `__lexora_id` column, so the session is keyed by
 * (course, weekday, start). Moving a course's class to another weekday is a
 * real edit of that slot, while reordering or inserting course rows never
 * changes another course's sessions.
 */
export function plannerSessionKey(courseId: number, weekday: number, startTime: number): string {
  const start = Math.round(startTime * 86_400).toString(36).padStart(4, "0");
  return `v_s${courseId.toString(36).padStart(3, "0")}${weekday.toString(36)}${start}`;
}

/**
 * "Thong tin lop hoc" G..K, one session per row. A row without a weekday label
 * or without readable times is invalid, never a fabricated 00:00 session.
 */
export async function syncPlannerCourseSessions(
  tx: Tx,
  connectionId: number,
  grid: PlannerGrid,
  courseIdByName: ReadonlyMap<string, number>,
  columns: { course: string; weekday: string; start: string; end: string; room: string } = {
    course: "G",
    weekday: "H",
    start: "I",
    end: "J",
    room: "K",
  },
): Promise<GridDomainResult> {
  const result = empty();
  const existing = await tx.select().from(studyPlannerCourseSessions).where(eq(studyPlannerCourseSessions.connectionId, connectionId));
  const byKey = new Map(existing.map((row) => [row.lexoraId, row]));
  for (const row of grid.rows) {
    const courseName = normalizeText(row.cells[columns.course] ?? "");
    if (!courseName) continue;
    const courseId = courseIdByName.get(courseName);
    if (courseId == null) continue;
    const weekdayCell = row.cells[columns.weekday];
    if (weekdayCell == null || normalizeText(weekdayCell) === "") continue;
    const parsed = importSessionCell(row, weekdayCell, row.cells[columns.start], row.cells[columns.end], row.cells[columns.room]);
    if (parsed.status !== "ok") {
      result.invalid += 1;
      continue;
    }
    const values = parsed.values as { weekday: number; startTime: number; endTime: number; room: string | null };
    const key = plannerSessionKey(courseId, values.weekday, values.startTime);
    const hit = byKey.get(key);
    if (hit) {
      if (hit.weekday !== values.weekday || hit.startTime !== values.startTime || hit.endTime !== values.endTime || hit.room !== values.room) {
        await tx
          .update(studyPlannerCourseSessions)
          .set({ weekday: values.weekday, startTime: values.startTime, endTime: values.endTime, room: values.room, updatedAt: new Date() })
          .where(eq(studyPlannerCourseSessions.id, hit.id));
        result.updated += 1;
      } else {
        result.unchanged += 1;
      }
      continue;
    }
    await tx.insert(studyPlannerCourseSessions).values({
      connectionId,
      courseId,
      lexoraId: key,
      weekday: values.weekday,
      startTime: values.startTime,
      endTime: values.endTime,
      room: values.room,
    });
    result.created += 1;
  }
  return result;
}

/**
 * "Habit Tracker": column A holds habit names, B..AF the day cells of the
 * month selected by the B3/B4 controls. Completions are keyed by
 * (habitId, real date) so inserting or reordering habits keeps their history.
 */
export async function syncPlannerHabits(
  tx: Tx,
  connectionId: number,
  grid: PlannerGrid,
  month: string,
  metadataColumn: string | undefined,
  dayColumns: readonly string[] = ["B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "AA", "AB", "AC", "AD", "AE", "AF"],
): Promise<GridDomainResult> {
  const result = empty();
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const existingHabits = await tx.select().from(studyPlannerHabits).where(eq(studyPlannerHabits.connectionId, connectionId));
  const byLexora = new Map(existingHabits.map((habit) => [habit.lexoraId, habit]));
  const byRow = new Map(existingHabits.filter((habit) => habit.sheetRow != null).map((habit) => [habit.sheetRow as number, habit]));
  const byName = new Map(existingHabits.map((habit) => [normalizeText(habit.name), habit]));

  for (const row of grid.rows) {
    const imported = importHabitRow(row, { metadataColumn });
    if (imported.status === "blank") continue;
    if (imported.status === "invalid") {
      result.invalid += 1;
      continue;
    }
    const name = (imported.values as { name: string }).name;
    // Identity: hidden id first, then the row it already occupies, then the name,
    // so a renamed habit keeps its completion history.
    const hit = (imported.lexoraId ? byLexora.get(imported.lexoraId) : undefined) ?? byRow.get(row.rowNumber) ?? byName.get(name);
    let habitId: number;
    if (hit) {
      habitId = hit.id;
      if (hit.name !== name || hit.sheetRow !== row.rowNumber) {
        await tx
          .update(studyPlannerHabits)
          .set({ name, sheetRow: row.rowNumber, archivedAt: null, updatedAt: new Date() })
          .where(eq(studyPlannerHabits.id, hit.id));
        result.updated += 1;
      } else {
        result.unchanged += 1;
      }
    } else {
      const lexoraId = imported.lexoraId || generateSourceId(new Set(byLexora.keys()));
      const [inserted] = await tx
        .insert(studyPlannerHabits)
        .values({ connectionId, lexoraId, name, sheetRow: row.rowNumber })
        .returning({ id: studyPlannerHabits.id, lexoraId: studyPlannerHabits.lexoraId, name: studyPlannerHabits.name, sheetRow: studyPlannerHabits.sheetRow });
      habitId = inserted.id;
      byLexora.set(lexoraId, inserted as never);
      byRow.set(row.rowNumber, inserted as never);
      byName.set(name, inserted as never);
      result.created += 1;
      if (!imported.lexoraId) result.idWrites.push({ rowNumber: row.rowNumber, sourceId: lexoraId });
    }

    for (const [index, column] of dayColumns.entries()) {
      const day = index + 1;
      // Columns past the end of the selected month are derived/empty in the
      // sheet; never invent a date the month does not have.
      if (day > daysInMonth) break;
      const completion = importHabitCompletion(row, String(habitId), column, `${month}-${String(day).padStart(2, "0")}`);
      if (!completion) continue;
      const existing = await tx
        .select()
        .from(studyPlannerHabitCompletions)
        .where(and(eq(studyPlannerHabitCompletions.habitId, habitId), eq(studyPlannerHabitCompletions.completionDate, completion.completionDate)))
        .limit(1);
      if (existing[0]) {
        if (existing[0].completed !== completion.completed) {
          await tx
            .update(studyPlannerHabitCompletions)
            .set({ completed: completion.completed, updatedAt: new Date() })
            .where(eq(studyPlannerHabitCompletions.id, existing[0].id));
          result.updated += 1;
        }
        continue;
      }
      await tx.insert(studyPlannerHabitCompletions).values({ habitId, completionDate: completion.completionDate, completed: completion.completed });
      result.updated += 1;
    }
  }
  return result;
}

/**
 * "Bang theo doi chuyen can": rows are courses (column A, resolved from
 * "Thong tin lop hoc") and columns F..AI are weekly sessions whose real dates
 * come from the derived header row 6. A mark is stored as
 * (session date, course name) so moving a session column never creates a new
 * course or new attendance history.
 */
export async function syncPlannerAttendance(
  tx: Tx,
  connectionId: number,
  courseRows: readonly PlannerGridRow[],
  sessionColumns: ReadonlyArray<{ column: string; date: string }>,
  courseIdByName: ReadonlyMap<string, number>,
  courseNameColumn = "A",
): Promise<GridDomainResult> {
  const result = empty();
  if (!sessionColumns.length) return result;
  const existingSessions = await tx
    .select()
    .from(studyPlannerAttendanceSessions)
    .where(eq(studyPlannerAttendanceSessions.connectionId, connectionId));
  const sessionIdByDate = new Map<string, number>(existingSessions.map((row) => [row.sessionDate, row.id]));
  const sorted = [...sessionColumns].sort((left, right) => left.date.localeCompare(right.date));
  for (const [index, session] of sorted.entries()) {
    if (sessionIdByDate.has(session.date)) continue;
    const [created] = await tx
      .insert(studyPlannerAttendanceSessions)
      .values({ connectionId, lexoraId: generateSourceId(), sessionIndex: index + 1, sessionDate: session.date })
      .returning({ id: studyPlannerAttendanceSessions.id });
    sessionIdByDate.set(session.date, created.id);
  }
  for (const row of courseRows) {
    const courseName = normalizeText(row.cells[courseNameColumn] ?? "");
    if (!courseName) continue;
    const courseId = courseIdByName.get(courseName) ?? null;
    for (const session of sessionColumns) {
      const sessionId = sessionIdByDate.get(session.date);
      if (sessionId == null) continue;
      const cell = row.cells[session.column];
      const mark = cell == null ? "" : normalizeText(cell);
      if (!mark) continue;
      if (!ATTENDANCE_MARKS.includes(mark as (typeof ATTENDANCE_MARKS)[number])) {
        result.invalid += 1;
        continue;
      }
      const existing = await tx
        .select()
        .from(studyPlannerAttendanceMarks)
        .where(and(eq(studyPlannerAttendanceMarks.sessionId, sessionId), eq(studyPlannerAttendanceMarks.courseName, courseName)))
        .limit(1);
      if (existing[0]) {
        if (existing[0].mark !== mark || existing[0].courseId !== courseId || existing[0].sheetColumn !== session.column) {
          await tx
            .update(studyPlannerAttendanceMarks)
            .set({ mark, courseId, sheetRow: row.rowNumber, sheetColumn: session.column, updatedAt: new Date() })
            .where(eq(studyPlannerAttendanceMarks.id, existing[0].id));
          result.updated += 1;
        } else {
          result.unchanged += 1;
        }
        continue;
      }
      await tx
        .insert(studyPlannerAttendanceMarks)
        .values({ connectionId, sessionId, courseName, mark, sheetRow: row.rowNumber, sheetColumn: session.column, courseId });
      result.created += 1;
    }
  }
  return result;
}

/** Aggregate several grid-domain results into one stats bucket. */
export function mergeGridDomainResults(results: ReadonlyArray<GridDomainResult>): GridDomainResult {
  const total = empty();
  for (const result of results) merge(total, result);
  return total;
}