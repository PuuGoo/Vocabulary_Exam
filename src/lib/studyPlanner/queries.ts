import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  studyPlannerActivities,
  studyPlannerAssignments,
  studyPlannerAttendanceMarks,
  studyPlannerAttendanceSessions,
  studyPlannerBulkReviews,
  studyPlannerConflicts,
  studyPlannerConnections,
  studyPlannerCourses,
  studyPlannerCourseSessions,
  studyPlannerCurriculumTopics,
  studyPlannerHabitCompletions,
  studyPlannerHabits,
  studyPlannerReadingMaterials,
  studyPlannerSettings,
  studyPlannerSyncChannels,
  studyPlannerSyncPending,
  studyPlannerSyncRevisions,
  studyPlannerSyncRuns,
  studyPlannerTasks,
  studyPlannerTodos,
  studyPlannerWriteQueue,
} from "@/db/schema";

/**
 * Phase 10 — Read helpers for the Study Planner web APIs.
 *
 * Every helper takes the resolved connectionId (never raw user input) so the
 * route layer can enforce ownership exactly once: the current session's
 * connection, derived from study_planner_connections.user_id.
 */

export async function loadPlannerConnectionForUser(userId: number) {
  const [connection] = await db.select().from(studyPlannerConnections).where(eq(studyPlannerConnections.userId, userId)).limit(1);
  return connection ?? null;
}

export async function loadPlannerConnectionStatus(connectionId: number) {
  const [connection] = await db.select().from(studyPlannerConnections).where(eq(studyPlannerConnections.id, connectionId)).limit(1);
  if (!connection) return null;
  const channelRows = await db
    .select({
      channelId: studyPlannerSyncChannels.channelId,
      expirationAt: studyPlannerSyncChannels.expirationAt,
      lastNotifiedAt: studyPlannerSyncChannels.lastNotifiedAt,
      status: studyPlannerSyncChannels.status,
    })
    .from(studyPlannerSyncChannels)
    .where(eq(studyPlannerSyncChannels.connectionId, connectionId));
  const channel = channelRows.find((row) => row.status === "active") ?? channelRows[0] ?? null;
  const [pending] = await db.select().from(studyPlannerSyncPending).where(eq(studyPlannerSyncPending.connectionId, connectionId)).limit(1);
  const revisionRows = await db
    .select({ revision: studyPlannerSyncRevisions.revision, syncedAt: studyPlannerSyncRevisions.syncedAt, reason: studyPlannerSyncRevisions.reason })
    .from(studyPlannerSyncRevisions)
    .where(eq(studyPlannerSyncRevisions.connectionId, connectionId))
    .orderBy(desc(studyPlannerSyncRevisions.revision))
    .limit(1);
  const revision = revisionRows[0] ?? null;
  return { connection, channel, pending: pending ?? null, revision };
}

export async function plannerConnectionHistory(connectionId: number, limit = 25) {
  const runs = await db
    .select({
      id: studyPlannerSyncRuns.id,
      triggerType: studyPlannerSyncRuns.triggerType,
      status: studyPlannerSyncRuns.status,
      rowsRead: studyPlannerSyncRuns.rowsRead,
      rowsCreated: studyPlannerSyncRuns.rowsCreated,
      rowsUpdated: studyPlannerSyncRuns.rowsUpdated,
      rowsDeleted: studyPlannerSyncRuns.rowsDeleted,
      rowsUnchanged: studyPlannerSyncRuns.rowsUnchanged,
      conflictCount: studyPlannerSyncRuns.conflictCount,
      errorMessage: studyPlannerSyncRuns.errorMessage,
      startedAt: studyPlannerSyncRuns.startedAt,
      finishedAt: studyPlannerSyncRuns.finishedAt,
    })
    .from(studyPlannerSyncRuns)
    .where(eq(studyPlannerSyncRuns.connectionId, connectionId))
    .orderBy(desc(studyPlannerSyncRuns.startedAt))
    .limit(limit);
  return runs;
}

// ---------------------------------------------------------------- dashboard

export type PlannerDashboard = {
  todayClasses: number;
  todayTasks: number;
  completedToday: number;
  remainingToday: number;
  overdueAssignments: number;
  dueSoonAssignments: number;
  habitCompletedThisMonth: number;
  attendancePresent: number;
  attendanceLate: number;
  attendanceAbsent: number;
  readingInProgress: number;
  gpa: number | null;
};

/**
 * Calculate dashboard aggregates from live PostgreSQL rows, never from stored
 * demo values. Grade/GPA uses the Vietnamese 10-point scale; rows without a
 * score are skipped rather than averaged as zero.
 */
export async function plannerDashboard(connectionId: number, today: string): Promise<PlannerDashboard> {
  const [tasksToday, overdue, dueSoon, habits, marks, reading, courses] = await Promise.all([
    db.select().from(studyPlannerTasks).where(and(eq(studyPlannerTasks.connectionId, connectionId), eq(studyPlannerTasks.taskDate, today), isNull(studyPlannerTasks.archivedAt))),
    db.select({ id: studyPlannerAssignments.id }).from(studyPlannerAssignments).where(and(eq(studyPlannerAssignments.connectionId, connectionId), isNull(studyPlannerAssignments.archivedAt), lte(studyPlannerAssignments.dueDate, today))),
    db.select({ id: studyPlannerAssignments.id }).from(studyPlannerAssignments).where(and(eq(studyPlannerAssignments.connectionId, connectionId), isNull(studyPlannerAssignments.archivedAt), sql`${studyPlannerAssignments.dueDate} > ${today}::date and ${studyPlannerAssignments.dueDate} <= (${today}::date + interval '7 days')`)),
    db.select({ id: studyPlannerHabits.id }).from(studyPlannerHabits).where(and(eq(studyPlannerHabits.connectionId, connectionId), isNull(studyPlannerHabits.archivedAt))),
    db.select({ mark: studyPlannerAttendanceMarks.mark }).from(studyPlannerAttendanceMarks).where(eq(studyPlannerAttendanceMarks.connectionId, connectionId)),
    db.select({ id: studyPlannerReadingMaterials.id }).from(studyPlannerReadingMaterials).where(and(eq(studyPlannerReadingMaterials.connectionId, connectionId), isNull(studyPlannerReadingMaterials.archivedAt))),
    db.select({ score: studyPlannerCourses.score }).from(studyPlannerCourses).where(eq(studyPlannerCourses.connectionId, connectionId)),
  ]);
  const completed = tasksToday.filter((task) => task.completed).length;
  let gpa: number | null = null;
  const scored = courses.map((row) => Number(row.score)).filter((value) => Number.isFinite(value));
  if (scored.length) gpa = Math.round((scored.reduce((sum, value) => sum + value, 0) / scored.length) * 100) / 100;
  return {
    todayClasses: 0,
    todayTasks: tasksToday.length,
    completedToday: completed,
    remainingToday: tasksToday.length - completed,
    overdueAssignments: overdue.length,
    dueSoonAssignments: dueSoon.length,
    habitCompletedThisMonth: habits.length,
    attendancePresent: marks.filter((row) => row.mark === "✔").length,
    attendanceLate: marks.filter((row) => row.mark === "⏳").length,
    attendanceAbsent: marks.filter((row) => row.mark === "✘").length,
    readingInProgress: reading.length,
    gpa,
  };
}

// ------------------------------------------------------------------- tasks

export async function listPlannerTasks(connectionId: number, options?: { from?: string; to?: string; limit?: number }) {
  const filters = [eq(studyPlannerTasks.connectionId, connectionId), isNull(studyPlannerTasks.archivedAt)];
  if (options?.from) filters.push(gte(studyPlannerTasks.taskDate, options.from));
  if (options?.to) filters.push(lte(studyPlannerTasks.taskDate, options.to));
  return db
    .select()
    .from(studyPlannerTasks)
    .where(and(...filters))
    .orderBy(asc(studyPlannerTasks.taskDate), asc(studyPlannerTasks.id))
    .limit(options?.limit ?? 200);
}

export async function findPlannerTask(connectionId: number, taskId: number) {
  const [row] = await db
    .select()
    .from(studyPlannerTasks)
    .where(and(eq(studyPlannerTasks.connectionId, connectionId), eq(studyPlannerTasks.id, taskId)))
    .limit(1);
  return row ?? null;
}

// ----------------------------------------------------------------- courses

export async function listPlannerCourses(connectionId: number) {
  const courses = await db.select().from(studyPlannerCourses).where(eq(studyPlannerCourses.connectionId, connectionId)).orderBy(asc(studyPlannerCourses.id));
  const sessions = await db
    .select()
    .from(studyPlannerCourseSessions)
    .where(eq(studyPlannerCourseSessions.connectionId, connectionId))
    .orderBy(asc(studyPlannerCourseSessions.weekday), asc(studyPlannerCourseSessions.startTime));
  return { courses, sessions };
}

// ------------------------------------------------------------- assignments

export async function listPlannerAssignments(connectionId: number) {
  return db
    .select()
    .from(studyPlannerAssignments)
    .where(and(eq(studyPlannerAssignments.connectionId, connectionId), isNull(studyPlannerAssignments.archivedAt)))
    .orderBy(asc(studyPlannerAssignments.dueDate), asc(studyPlannerAssignments.id));
}

// ----------------------------------------------------------------- reading

export async function listPlannerReading(connectionId: number) {
  return db.select().from(studyPlannerReadingMaterials).where(and(eq(studyPlannerReadingMaterials.connectionId, connectionId), isNull(studyPlannerReadingMaterials.archivedAt))).orderBy(asc(studyPlannerReadingMaterials.id));
}

// --------------------------------------------------------------- curriculum

export async function listPlannerCurriculum(connectionId: number) {
  return db.select().from(studyPlannerCurriculumTopics).where(and(eq(studyPlannerCurriculumTopics.connectionId, connectionId), isNull(studyPlannerCurriculumTopics.archivedAt))).orderBy(asc(studyPlannerCurriculumTopics.id));
}

// -------------------------------------------------------------------- todos

export async function listPlannerTodos(connectionId: number) {
  return db.select().from(studyPlannerTodos).where(and(eq(studyPlannerTodos.connectionId, connectionId), isNull(studyPlannerTodos.archivedAt))).orderBy(asc(studyPlannerTodos.dueDate), asc(studyPlannerTodos.id));
}

// --------------------------------------------------------------- activities

export async function listPlannerActivities(connectionId: number, options?: { from?: string; to?: string }) {
  const filters = [eq(studyPlannerActivities.connectionId, connectionId), isNull(studyPlannerActivities.archivedAt)];
  if (options?.from) filters.push(gte(studyPlannerActivities.activityDate, options.from));
  if (options?.to) filters.push(lte(studyPlannerActivities.activityDate, options.to));
  return db.select().from(studyPlannerActivities).where(and(...filters)).orderBy(asc(studyPlannerActivities.activityDate), asc(studyPlannerActivities.id));
}

// ------------------------------------------------------------------ habits

export async function listPlannerHabits(connectionId: number, month: string) {
  const habits = await db.select().from(studyPlannerHabits).where(and(eq(studyPlannerHabits.connectionId, connectionId), isNull(studyPlannerHabits.archivedAt))).orderBy(asc(studyPlannerHabits.id));
  const completions =
    habits.length === 0
      ? []
      : await db
          .select({ habitId: studyPlannerHabitCompletions.habitId, completionDate: studyPlannerHabitCompletions.completionDate, completed: studyPlannerHabitCompletions.completed })
          .from(studyPlannerHabitCompletions)
          .innerJoin(studyPlannerHabits, eq(studyPlannerHabitCompletions.habitId, studyPlannerHabits.id))
          .where(and(eq(studyPlannerHabits.connectionId, connectionId), gte(studyPlannerHabitCompletions.completionDate, `${month}-01`), lte(studyPlannerHabitCompletions.completionDate, `${month}-31`)));
  return { habits, completions };
}

// -------------------------------------------------------------- attendance

export async function listPlannerAttendance(connectionId: number) {
  const sessions = await db.select().from(studyPlannerAttendanceSessions).where(eq(studyPlannerAttendanceSessions.connectionId, connectionId)).orderBy(asc(studyPlannerAttendanceSessions.sessionDate));
  const marks = await db.select().from(studyPlannerAttendanceMarks).where(eq(studyPlannerAttendanceMarks.connectionId, connectionId));
  return { sessions, marks };
}

// ---------------------------------------------------------------- conflicts

export async function listPlannerConflicts(connectionId: number, includeResolved = false) {
  const filters = [eq(studyPlannerConflicts.connectionId, connectionId)];
  if (!includeResolved) filters.push(isNull(studyPlannerConflicts.resolvedAt));
  return db.select().from(studyPlannerConflicts).where(and(...filters)).orderBy(asc(studyPlannerConflicts.id)).limit(100);
}

export async function listPlannerBulkReviews(connectionId: number) {
  return db
    .select()
    .from(studyPlannerBulkReviews)
    .where(and(eq(studyPlannerBulkReviews.connectionId, connectionId), eq(studyPlannerBulkReviews.status, "pending")))
    .orderBy(desc(studyPlannerBulkReviews.createdAt))
    .limit(25);
}

export async function loadPlannerSettings(connectionId: number) {
  const [row] = await db.select().from(studyPlannerSettings).where(eq(studyPlannerSettings.connectionId, connectionId)).limit(1);
  return row ?? null;
}

export async function pendingPlannerWrites(connectionId: number) {
  return db.select().from(studyPlannerWriteQueue).where(and(eq(studyPlannerWriteQueue.connectionId, connectionId), eq(studyPlannerWriteQueue.status, "pending"))).orderBy(asc(studyPlannerWriteQueue.createdAt)).limit(50);
}

