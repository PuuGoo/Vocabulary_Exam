import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  studyPlannerActivities,
  studyPlannerAssignments,
  studyPlannerAttendanceMarks,
  studyPlannerAttendanceSessions,
  studyPlannerCourses,
  studyPlannerCourseSessions,
  studyPlannerCurriculumTopics,
  studyPlannerHabitCompletions,
  studyPlannerHabits,
  studyPlannerReadingMaterials,
  studyPlannerSettings,
  studyPlannerTasks,
  studyPlannerTodos,
} from "@/db/schema";
import { fingerprintPlannerRecord, plannerFingerprintKeys } from "@/lib/studyPlanner/fingerprint";
import {
  coordinateWebWrites,
  type WebWriteInput,
} from "@/lib/studyPlanner/coordinate";
import {
  normalizeCheckbox,
  normalizeDate,
  normalizeDurationMinutes,
  normalizeInteger,
  normalizeNumber,
  normalizeText,
  normalizeTimeFraction,
  normalizeWeekday,
  PLANNER_DATE_PATTERN,
} from "@/lib/studyPlanner/values";
import { habitDayColumn } from "@/lib/studyPlanner/values";
import { WORKBOOK_RANGES, type WorkbookTab } from "@/lib/studyPlanner/workbookMap";
import { loadPlannerConnectionForUser } from "@/lib/studyPlanner/queries";
import { plannerDashboard } from "@/lib/studyPlanner/queries";
import { todayLocal } from "@/lib/studyPlanner/values";

/**
 * Phase 4.3/10 — Web -> PostgreSQL mutations with coordinated Sheet writes.
 *
 * Every web edit lands in PostgreSQL and also enqueues one Sheets range write
 * through the write queue so the web and Sheet views never diverge. The queue
 * carries the expected fingerprint so the webhook can recognise its own echo.
 *
 * All inputs are validated with zod and normalised through the same layer the
 * Sheet importer uses, and every helper asserts ownership by taking only the
 * session user's connection — never a client-supplied user id.
 */

/** Derive the authorised (connectionId, spreadsheetId) from the session. */
export async function plannerConnectionForSession(userId: number) {
  const connection = await loadPlannerConnectionForUser(userId);
  if (!connection) return null;
  if (!connection.enabled || connection.status === "disconnected") return null;
  return connection;
}

function requireWritableTab(tab: WorkbookTab, letters: string[]): void {
  const range = WORKBOOK_RANGES[tab];
  if (!range) throw new Error(`Tab ${tab} is derived and cannot be edited from the web`);
  const writable = new Set([...range.sourceColumns, ...(range.controlColumns ?? [])]);
  for (const letter of letters) {
    if (!writable.has(letter)) throw new Error(`Column ${letter} on tab ${tab} is derived`);
  }
}

/** Queue one source-range write from within a web mutation. */
async function enqueueWebEdit(
  connectionId: number,
  tab: WorkbookTab,
  rowNumber: number | null,
  columns: Record<string, string | number | boolean | null>,
  fingerprintValues: Record<string, unknown>,
  domain: Parameters<typeof plannerFingerprintKeys>[0],
) {
  if (rowNumber == null) return;
  requireWritableTab(tab, Object.keys(columns));
  const input = {
    connectionId,
    tab,
    rowNumber,
    valuesByColumn: columns,
    fingerprintValues,
    domain,
  } as WebWriteInput;
  await coordinateWebWrites([input]);
}

// ------------------------------------------------------------------ tasks

export const plannerTaskInput = z.object({
  taskDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  taskTitle: z.string().min(1).max(500),
  completed: z.boolean().optional(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  ieltsSkill: z.string().nullable().optional(),
  priority: z.string().nullable().optional(),
  durationMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  notes: z.string().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export type PlannerTaskInput = z.infer<typeof plannerTaskInput>;

export async function createPlannerTask(userId: number, input: PlannerTaskInput) {
  const connection = await plannerConnectionForSession(userId);
  if (!connection) throw new Error("Planner chưa được kết nối");
  const parsed = plannerTaskInput.parse(input);
  const normalised = {
    taskDate: normalizeDate(parsed.taskDate) ?? parsed.taskDate,
    taskTitle: normalizeText(parsed.taskTitle),
    completed: parsed.completed ?? false,
    startTime: parsed.startTime ? normalizeTimeFraction(parsed.startTime) : null,
    endTime: parsed.endTime ? normalizeTimeFraction(parsed.endTime) : null,
    category: parsed.category ? normalizeText(parsed.category) : null,
    ieltsSkill: parsed.ieltsSkill ? normalizeText(parsed.ieltsSkill) : null,
    priority: parsed.priority ? normalizeText(parsed.priority) : null,
    durationMinutes: normalizeDurationMinutes(parsed.durationMinutes),
    notes: parsed.notes ? normalizeText(parsed.notes) : null,
    dueDate: parsed.dueDate ? (normalizeDate(parsed.dueDate) ?? parsed.dueDate) : null,
  };
  if (!normalised.taskTitle || !PLANNER_DATE_PATTERN.test(normalised.taskDate)) throw new Error("Ngày hoặc tên nhiệm vụ không hợp lệ");
  const [created] = await db.transaction(async (tx) => {
    const lexoraId = `v_${Math.random().toString(16).slice(2, 10)}`;
    const [row] = await tx
      .insert(studyPlannerTasks)
      .values({
        connectionId: connection.id,
        lexoraId,
        taskDate: normalised.taskDate,
        taskTitle: normalised.taskTitle,
        completed: normalised.completed,
        startTime: normalised.startTime,
        endTime: normalised.endTime,
        category: normalised.category,
        ieltsSkill: normalised.ieltsSkill,
        priority: normalised.priority,
        durationMinutes: normalised.durationMinutes,
        notes: normalised.notes,
        dueDate: normalised.dueDate,
      })
      .returning();
    return [row];
  });
  const fingerprintValues = {
    task_title: created.taskTitle,
    task_date: created.taskDate,
    completed: created.completed,
  } as Record<string, unknown>;
  await enqueueWebEdit(connection.id, "Nhật ký nhiệm vụ", created.sheetRow, { H: created.taskTitle, B: created.taskDate }, fingerprintValues, "task");
  return created;
}

export const plannerTaskPatch = plannerTaskInput.partial().extend({ id: z.number().int().positive() });

export async function patchPlannerTask(userId: number, patch: z.infer<typeof plannerTaskPatch>) {
  const connection = await plannerConnectionForSession(userId);
  if (!connection) throw new Error("Planner chưa được kết nối");
  const parsed = plannerTaskPatch.parse(patch);
  const [existing] = await db.select().from(studyPlannerTasks).where(and(eq(studyPlannerTasks.connectionId, connection.id), eq(studyPlannerTasks.id, parsed.id))).limit(1);
  if (!existing) throw new Error("Không tìm thấy nhiệm vụ");
  const next = {
    taskDate: parsed.taskDate != null ? (normalizeDate(parsed.taskDate) ?? parsed.taskDate) : existing.taskDate,
    taskTitle: parsed.taskTitle != null ? normalizeText(parsed.taskTitle) : existing.taskTitle,
    completed: parsed.completed ?? existing.completed,
    startTime: parsed.startTime !== undefined ? (parsed.startTime ? normalizeTimeFraction(parsed.startTime) : null) : existing.startTime,
    endTime: parsed.endTime !== undefined ? (parsed.endTime ? normalizeTimeFraction(parsed.endTime) : null) : existing.endTime,
    category: parsed.category !== undefined ? (parsed.category ? normalizeText(parsed.category) : null) : existing.category,
    priority: parsed.priority !== undefined ? (parsed.priority ? normalizeText(parsed.priority) : null) : existing.priority,
    durationMinutes: parsed.durationMinutes !== undefined ? normalizeDurationMinutes(parsed.durationMinutes) : existing.durationMinutes,
    notes: parsed.notes !== undefined ? (parsed.notes ? normalizeText(parsed.notes) : null) : existing.notes,
    dueDate: parsed.dueDate !== undefined ? (parsed.dueDate ? (normalizeDate(parsed.dueDate) ?? parsed.dueDate) : null) : existing.dueDate,
    ieltsSkill: (existing as { ieltsSkill: string | null }).ieltsSkill,
  };
  const [updated] = await db.update(studyPlannerTasks).set({ ...next, updatedAt: new Date() }).where(eq(studyPlannerTasks.id, existing.id)).returning();
  await enqueueWebEdit(connection.id, "Nhật ký nhiệm vụ", updated.sheetRow, { H: updated.taskTitle, B: updated.taskDate, C: updated.completed }, { task_title: updated.taskTitle, task_date: updated.taskDate, completed: updated.completed } as Record<string, unknown>, "task");
  return updated;
}

export async function archivePlannerTask(userId: number, taskId: number) {
  const connection = await plannerConnectionForSession(userId);
  if (!connection) throw new Error("Planner chưa được kết nối");
  const [existing] = await db.select().from(studyPlannerTasks).where(and(eq(studyPlannerTasks.connectionId, connection.id), eq(studyPlannerTasks.id, taskId))).limit(1);
  if (!existing) throw new Error("Không tìm thấy nhiệm vụ");
  await db.update(studyPlannerTasks).set({ archivedAt: new Date(), updatedAt: new Date() }).where(eq(studyPlannerTasks.id, existing.id));
  return { archived: true };
}

// ------------------------------------------------------------------ habits

export async function toggleHabitCompletion(userId: number, input: { habitId: number; date: string; completed: boolean }) {
  const connection = await plannerConnectionForSession(userId);
  if (!connection) throw new Error("Planner chưa được kết nối");
  const date = normalizeDate(input.date);
  if (!date) throw new Error("Ngày không hợp lệ");
  const [habit] = await db.select().from(studyPlannerHabits).where(and(eq(studyPlannerHabits.connectionId, connection.id), eq(studyPlannerHabits.id, input.habitId))).limit(1);
  if (!habit) throw new Error("Không tìm thấy habit");
  const [row] = await db
    .insert(studyPlannerHabitCompletions)
    .values({ habitId: habit.id, completionDate: date, completed: input.completed })
    .onConflictDoUpdate({ target: [studyPlannerHabitCompletions.habitId, studyPlannerHabitCompletions.completionDate], set: { completed: input.completed, updatedAt: new Date() } })
    .returning();
  // The completion's own date maps to the month-grid column B..AF;
  // writing column B for every day would corrupt the whole month.
  const habitColumn = habitDayColumn(date);
  if (habit.sheetRow != null && habitColumn) {
    await enqueueWebEdit(connection.id, "Habit Tracker", habit.sheetRow, { [habitColumn]: input.completed }, { name: habit.name }, "habit");
  }
  return row;
}

// -------------------------------------------------------------- attendance

export async function setAttendanceMark(userId: number, input: { sessionId: number; courseName: string; mark: "✔" | "✘" | "⏳" }) {
  const connection = await plannerConnectionForSession(userId);
  if (!connection) throw new Error("Planner chưa được kết nối");
  const courseName = normalizeText(input.courseName);
  if (!courseName) throw new Error("Thiếu tên môn học");
  const [session] = await db.select().from(studyPlannerAttendanceSessions).where(and(eq(studyPlannerAttendanceSessions.connectionId, connection.id), eq(studyPlannerAttendanceSessions.id, input.sessionId))).limit(1);
  if (!session) throw new Error("Không tìm thấy buổi học");
  const [row] = await db
    .insert(studyPlannerAttendanceMarks)
    .values({ connectionId: connection.id, sessionId: session.id, courseName, mark: input.mark })
    .onConflictDoUpdate({ target: [studyPlannerAttendanceMarks.sessionId, studyPlannerAttendanceMarks.courseName], set: { mark: input.mark, updatedAt: new Date() } })
    .returning();
  // The stored mark already knows its own (course row, session column);
  // writing to a hard-coded column would overwrite the wrong session.
  if (row.sheetRow != null && row.sheetColumn) {
    await enqueueWebEdit(connection.id, "Bảng theo dõi chuyên cần", row.sheetRow, { [row.sheetColumn]: input.mark },
      { course_name: courseName, mark: input.mark } as Record<string, unknown>, "attendanceMark");
  }
  return row;
}

// ----------------------------------------------------------- todos (list)

export const plannerTodoInput = z.object({
  taskTitle: z.string().min(1).max(500),
  category: z.string().nullable().optional(),
  priority: z.string().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().nullable().optional(),
  completed: z.boolean().optional(),
});

export async function createPlannerTodo(userId: number, input: z.infer<typeof plannerTodoInput>) {
  const connection = await plannerConnectionForSession(userId);
  if (!connection) throw new Error("Planner chưa được kết nối");
  const parsed = plannerTodoInput.parse(input);
  const [created] = await db
    .insert(studyPlannerTodos)
    .values({
      connectionId: connection.id,
      lexoraId: `v_${Math.random().toString(16).slice(2, 10)}`,
      taskTitle: normalizeText(parsed.taskTitle),
      category: parsed.category ? normalizeText(parsed.category) : null,
      priority: parsed.priority ? normalizeText(parsed.priority) : null,
      dueDate: parsed.dueDate ?? null,
      notes: parsed.notes ? normalizeText(parsed.notes) : null,
      completed: parsed.completed ?? false,
    })
    .returning();
  await enqueueWebEdit(connection.id, "Danh sách việc cần làm", created.sheetRow, { B: created.taskTitle }, { task_title: created.taskTitle, completed: created.completed } as Record<string, unknown>, "todo");
  return created;
}

// -------------------------------------------------------------- dashboard

export async function plannerOverviewForUser(userId: number) {
  const connection = await plannerConnectionForSession(userId);
  if (!connection) return { connected: false as const };
  const dashboard = await plannerDashboard(connection.id, todayLocal());
  return {
    connected: true as const,
    connection: {
      id: connection.id,
      spreadsheetUrl: connection.spreadsheetUrl,
      spreadsheetName: connection.spreadsheetName,
      status: connection.status,
      lastSyncedAt: connection.lastSyncedAt,
      lastError: connection.lastError,
    },
    dashboard,
    fingerprint: fingerprintPlannerRecord("settings", {
      semester_start: connection.lastSyncedAt?.toISOString() ?? "",
      semester_end: "",
    }),
    plannerKeys: plannerFingerprintKeys("settings"),
  };
}

export { normalizeCheckbox, normalizeDate, normalizeInteger, normalizeNumber, normalizeText };

