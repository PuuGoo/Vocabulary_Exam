import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { studyPlannerConnections, studyPlannerCourses } from "@/db/schema";
import { GoogleSheetsError, isRetryableCode } from "@/lib/googleSheets/errors";
import type { GoogleWorkspaceApi, SheetsValue } from "@/lib/googleSheets/api";
import { quoteSheetTitle } from "@/lib/googleSheets/spreadsheet";
import { gridFromPlannerValues, type PlannerGrid } from "@/lib/studyPlanner/columnGrid";
import { WORKBOOK_RANGES, type WorkbookTab } from "@/lib/studyPlanner/workbookMap";
import {
  flushPlannerIdWrites,
  syncPlannerActivitiesFromGrid,
  syncPlannerAssignmentsFromGrid,
  syncPlannerCoursesFromGrid,
  syncPlannerCurriculumFromGrid,
  syncPlannerIeltsFromGrid,
  syncPlannerReadingFromGrid,
  syncPlannerTasksFromGrid,
  syncPlannerTodosFromGrid,
} from "@/lib/studyPlanner/syncPlannerEngine";
import {
  ATTENDANCE_DATE_ROW,
  attendanceSessionColumns,
  plannerControlValues,
  plannerMonthFromControls,
  syncPlannerAttendance,
  syncPlannerCourseSessions,
  syncPlannerHabits,
  syncPlannerSettings,
} from "@/lib/studyPlanner/syncPlannerGridDomains";
import {
  acquirePlannerSyncLock,
  bumpPlannerRevision,
  clearPlannerSyncPending,
  finishPlannerSyncRun,
  markPlannerConnectionSyncState,
  markPlannerSyncPending,
  releasePlannerSyncLock,
  startPlannerSyncRun,
  type PlannerSyncTrigger,
} from "@/lib/studyPlanner/store";

/**
 * Phase 4b/5 planner sync orchestrator.
 *
 * Flow: durable pending -> one lock per planner -> one batched read per tab ->
 * row domains upserted first, then the grid domains that key off course ids ->
 * __lexora_id backfill writes -> pending cleared only after a fully successful
 * run. Everything happens inside one transaction, so a failure never leaves
 * half of a planner imported.
 *
 * A failed read never deletes: every domain upsert is driven by rows the Sheet
 * actually returned, and archival of vanished rows is a separate, explicit
 * step (Phase 4.4 policy) rather than a side effect of an empty grid.
 */

export type PlannerSyncStats = {
  rowsRead: number;
  rowsCreated: number;
  rowsUpdated: number;
  rowsUnchanged: number;
  rowsDeleted: number;
  invalidRows: number;
  duplicateRows: number;
  domains: string[];
};

export type PlannerSyncResult = {
  status: "synced" | "partial" | "error" | "locked" | "skipped";
  stats?: PlannerSyncStats;
  error?: string;
  retryable?: boolean;
};

const TAB_COURSES: WorkbookTab = "Thông tin lớp học";
const TAB_HABITS: WorkbookTab = "Habit Tracker";
const TAB_ATTENDANCE: WorkbookTab = "Bảng theo dõi chuyên cần";

/** Tabs read per sync, in the order they should be applied. */
const SYNC_TABS: WorkbookTab[] = [
  "Nhật ký nhiệm vụ",
  "Kế hoạch ngày & IELTS",
  TAB_COURSES,
  "Quản lý giáo trình",
  "Bảng theo dõi bài tập",
  "Danh sách tài liệu đọc",
  TAB_HABITS,
  "Danh sách việc cần làm",
  "Hoạt động",
  TAB_ATTENDANCE,
];

type TabPlan = { tab: WorkbookTab; dataFrom: number; dataTo: number | null; columns: string[]; metadataColumn: string | undefined };

function planFor(tab: WorkbookTab): TabPlan | null {
  const range = WORKBOOK_RANGES[tab];
  if (!range) return null;
  return {
    tab,
    dataFrom: range.dataFrom,
    dataTo: range.dataTo,
    columns: [...range.sourceColumns, ...(range.controlColumns ?? [])],
    metadataColumn: range.metadataColumn,
  };
}

function gridFor(tab: WorkbookTab, valuesByTab: ReadonlyMap<string, SheetsValue | undefined>): PlannerGrid | undefined {
  const range = WORKBOOK_RANGES[tab];
  const values = valuesByTab.get(tab);
  // A tab whose read failed (undefined) yields no grid, so nothing is touched.
  if (!range || values === undefined) return undefined;
  return gridFromPlannerValues({
    tab,
    values,
    dataFrom: range.dataFrom,
    dataTo: range.dataTo,
    columns: [...range.sourceColumns, ...(range.controlColumns ?? [])],
  });
}

export const MASTER_TEMPLATE_MESSAGE = "Planner \u0111ang tr\u1ecf v\u00e0o file m\u1eabu d\u00f9ng chung. H\u00e3y t\u1ea1o b\u1ea3n sao ri\u00eang.";

export async function syncPlannerConnection(
  connectionId: number,
  trigger: PlannerSyncTrigger,
  api: GoogleWorkspaceApi,
): Promise<PlannerSyncResult> {
  const [connection] = await db.select().from(studyPlannerConnections).where(eq(studyPlannerConnections.id, connectionId)).limit(1);
  if (!connection || !connection.enabled || connection.status === "disconnected") return { status: "skipped" };
  // A connection whose file IS the currently-published master template stays
  // read-only: writing the hidden __lexora_id column would stamp the shared
  // template every future copy is cut from, so skip loudly instead.
  try {
    const [{ getActivePlannerTemplateId }, { PLANNER_TEMPLATE_ID }] = await Promise.all([
      import("@/lib/studyPlanner/template"),
      import("@/lib/studyPlanner"),
    ]);
    const masterId = await getActivePlannerTemplateId(PLANNER_TEMPLATE_ID);
    if (masterId && connection.spreadsheetId === masterId) {
      await db
        .update(studyPlannerConnections)
        .set({ status: "disconnected", enabled: false, lastError: MASTER_TEMPLATE_MESSAGE, lastErrorAt: new Date(), updatedAt: new Date() })
        .where(eq(studyPlannerConnections.id, connectionId));
      return { status: "skipped" };
    }
  } catch {
    // A registry lookup failure must never block sync: the normal path fails
    // loudly on its own when the target is actually wrong.
  }

  const plans = SYNC_TABS.map(planFor).filter((plan): plan is TabPlan => plan != null);
  // 1) Durable pending before any long work.
  await markPlannerSyncPending(connectionId, trigger);
  const runId = await startPlannerSyncRun(connectionId, trigger);
  try {
    // 2) One lock per planner: webhook / manual / cron never overlap.
    await acquirePlannerSyncLock(connectionId, "planner_" + trigger);
  } catch (error) {
    await finishPlannerSyncRun(runId, "error", { errorMessage: error instanceof Error ? error.message : "locked" });
    return { status: "locked" };
  }

  const startedAt = new Date();
  const stats: PlannerSyncStats = {
    rowsRead: 0,
    rowsCreated: 0,
    rowsUpdated: 0,
    rowsUnchanged: 0,
    rowsDeleted: 0,
    invalidRows: 0,
    duplicateRows: 0,
    domains: [],
  };
  const idWriteQueue: Array<{ tab: string; column: string; rows: Array<{ rowNumber: number; sourceId: string }> }> = [];

  try {
    // 3) One read per tab; no per-cell requests. The range starts at row 1 so
    // the editable control cells (semester dates, habit month) are included.
    const valuesByTab = new Map<string, SheetsValue | undefined>();
    await Promise.all(
      plans.map(async (plan) => {
        const lastRow = plan.dataTo == null ? plan.dataFrom + 2000 : Math.max(plan.dataFrom, plan.dataTo);
        const range = quoteSheetTitle(plan.tab) + "!A1:BZ" + lastRow;
        const values = await api.readValues(connection.spreadsheetId, range);
        valuesByTab.set(plan.tab, values);
      }),
    );

    const courseGrid = gridFor(TAB_COURSES, valuesByTab);
    const habitGrid = gridFor(TAB_HABITS, valuesByTab);
    const attendanceGrid = gridFor(TAB_ATTENDANCE, valuesByTab);

    // 4) Upserts in one transaction so a failure leaves no partial domain state.
    await db.transaction(async (tx) => {
      // Row domains first: courses must exist before the timetable, habits and
      // attendance grids can key off their ids.
      for (const plan of plans) {
        const grid = gridFor(plan.tab, valuesByTab);
        if (!grid) continue;
        const result = await runDomainSync(tx, connectionId, plan, grid);
        if (!result) continue;
        stats.rowsRead += result.stats.rowsRead;
        stats.rowsCreated += result.stats.created;
        stats.rowsUpdated += result.stats.updated;
        stats.rowsUnchanged += result.stats.unchanged;
        stats.invalidRows += result.stats.invalid;
        stats.duplicateRows += result.stats.duplicate;
        stats.domains.push(result.stats.domain);
        if (result.idWrites.length && plan.metadataColumn) {
          idWriteQueue.push({ tab: plan.tab, column: plan.metadataColumn, rows: result.idWrites });
        }
      }

      // Course names are the join key of every grid domain: the timetable, the
      // attendance rows and the planner UI all refer to a course by name.
      const courses = await tx
        .select({ id: studyPlannerCourses.id, courseName: studyPlannerCourses.courseName })
        .from(studyPlannerCourses)
        .where(eq(studyPlannerCourses.connectionId, connectionId));
      const courseIdByName = new Map<string, number>();
      for (const course of courses) {
        courseIdByName.set(plannerCourseKey(course.courseName), course.id);
      }

      // Editable control cells only; derived neighbours are never written.
      const controls = plannerControlValues(valuesByTab);
      const settingsResult = await syncPlannerSettings(tx, connectionId, controls);
      stats.rowsCreated += settingsResult.created;
      stats.rowsUpdated += settingsResult.updated;
      stats.rowsUnchanged += settingsResult.unchanged;
      stats.invalidRows += settingsResult.invalid;
      stats.domains.push("settings");

      if (courseGrid) {
        // "Thông tin lớp học" G..K: one session per row.
        const sessionResult = await syncPlannerCourseSessions(tx, connectionId, courseGrid, courseIdByName);
        stats.rowsCreated += sessionResult.created;
        stats.rowsUpdated += sessionResult.updated;
        stats.rowsUnchanged += sessionResult.unchanged;
        stats.invalidRows += sessionResult.invalid;
        stats.rowsRead += courseGrid.rows.length;
        stats.domains.push("course_sessions");
      }

      if (habitGrid) {
        // "Habit Tracker" B..AF is the month selected by the B3/B4 controls.
        const habitMonth = plannerMonthFromControls(controls.habitYear, controls.habitMonth);
        const habitMetadataColumn = WORKBOOK_RANGES[TAB_HABITS]?.metadataColumn;
        const habitResult = await syncPlannerHabits(tx, connectionId, habitGrid, habitMonth, habitMetadataColumn);
        stats.rowsCreated += habitResult.created;
        stats.rowsUpdated += habitResult.updated;
        stats.rowsUnchanged += habitResult.unchanged;
        stats.invalidRows += habitResult.invalid;
        stats.rowsRead += habitGrid.rows.length;
        stats.domains.push("habits");
        if (habitResult.idWrites.length && habitMetadataColumn) {
          idWriteQueue.push({ tab: TAB_HABITS, column: habitMetadataColumn, rows: habitResult.idWrites });
        }
      }

      if (attendanceGrid) {
        // "Bảng theo dõi chuyên cần" F..AI: one column per weekly session,
        // whose real date lives in the derived header row.
        const sessionColumns = attendanceSessionColumns(valuesByTab.get(TAB_ATTENDANCE));
        if (sessionColumns.length) {
          const attendanceResult = await syncPlannerAttendance(tx, connectionId, attendanceGrid.rows, sessionColumns, courseIdByName);
          stats.rowsCreated += attendanceResult.created;
          stats.rowsUpdated += attendanceResult.updated;
          stats.rowsUnchanged += attendanceResult.unchanged;
          stats.invalidRows += attendanceResult.invalid;
          stats.rowsRead += attendanceGrid.rows.length;
          stats.domains.push("attendance");
        }
      }
    });

    // 5) Backfill hidden __lexora_id cells so the next sync resolves identity.
    if (idWriteQueue.length) await flushPlannerIdWrites(api, connection.spreadsheetId, idWriteQueue);

    const partial = stats.invalidRows > 0;
    await bumpPlannerRevision(connectionId, trigger);
    await finishPlannerSyncRun(runId, partial ? "partial" : "success", {
      rowsRead: stats.rowsRead,
      rowsCreated: stats.rowsCreated,
      rowsUpdated: stats.rowsUpdated,
      rowsUnchanged: stats.rowsUnchanged,
      rowsDeleted: stats.rowsDeleted,
      conflictCount: 0,
      metadata: { domains: stats.domains, invalidRows: stats.invalidRows },
    });
    await markPlannerConnectionSyncState(connectionId, { ok: true, partial });
    // 6) Clear pending only now: any earlier failure leaves work for retry.
    await clearPlannerSyncPending(connectionId, startedAt);
    return { status: partial ? "partial" : "synced", stats };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    const retryable = error instanceof GoogleSheetsError ? isRetryableCode(error.code) : true;
    await finishPlannerSyncRun(runId, "error", { errorMessage: message });
    await markPlannerConnectionSyncState(connectionId, { ok: false, error: message, retryable });
    return { status: "error", error: message, retryable };
  } finally {
    await releasePlannerSyncLock(connectionId);
  }
}

/** Case/whitespace-insensitive course name, the join key of every grid domain. */
function plannerCourseKey(courseName: string | null | undefined): string {
  return String(courseName ?? "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

async function runDomainSync(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], connectionId: number, plan: TabPlan, grid: PlannerGrid) {
  switch (plan.tab) {
    case "Nhật ký nhiệm vụ":
      return syncPlannerTasksFromGrid(tx, connectionId, grid, plan.metadataColumn);
    case "Kế hoạch ngày & IELTS":
      // Only the IELTS practice block is source data here; columns B..G are
      // formulas mirroring "Nhật ký nhiệm vụ" and would duplicate its tasks.
      return syncPlannerIeltsFromGrid(tx, connectionId, grid, plan.metadataColumn);
    case "Thông tin lớp học":
      return syncPlannerCoursesFromGrid(tx, connectionId, grid, plan.metadataColumn);
    case "Quản lý giáo trình":
      return syncPlannerCurriculumFromGrid(tx, connectionId, grid, plan.metadataColumn);
    case "Bảng theo dõi bài tập":
      return syncPlannerAssignmentsFromGrid(tx, connectionId, grid, plan.metadataColumn);
    case "Danh sách tài liệu đọc":
      return syncPlannerReadingFromGrid(tx, connectionId, grid, plan.metadataColumn);
    case "Danh sách việc cần làm":
      return syncPlannerTodosFromGrid(tx, connectionId, grid, plan.metadataColumn);
    case "Hoạt động":
      return syncPlannerActivitiesFromGrid(tx, connectionId, grid, plan.metadataColumn);
    default:
      return null;
  }
}

/** Planner connections whose last successful sync is older than the window. */
export async function stalePlannerConnections(limit: number) {
  return db
    .select({ connectionId: studyPlannerConnections.id })
    .from(studyPlannerConnections)
    .where(
      and(
        eq(studyPlannerConnections.enabled, true),
        sql`(${studyPlannerConnections.lastSyncedAt} is null or ${studyPlannerConnections.lastSyncedAt} < now() - interval '15 minutes')`,
      ),
    )
    .limit(limit);
}