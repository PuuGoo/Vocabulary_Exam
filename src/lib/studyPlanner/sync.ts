import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { studyPlannerConnections } from "@/db/schema";
import { GoogleSheetsError, isRetryableCode } from "@/lib/googleSheets/errors";
import type { GoogleWorkspaceApi, SheetsValue } from "@/lib/googleSheets/api";
import { gridFromPlannerValues } from "@/lib/studyPlanner/columnGrid";
import { WORKBOOK_RANGES, type WorkbookTab } from "@/lib/studyPlanner/workbookMap";
import {
  flushPlannerIdWrites,
  syncPlannerActivitiesFromGrid,
  syncPlannerAssignmentsFromGrid,
  syncPlannerCoursesFromGrid,
  syncPlannerCurriculumFromGrid,
  syncPlannerReadingFromGrid,
  syncPlannerTasksFromGrid,
  syncPlannerTodosFromGrid,
} from "@/lib/studyPlanner/syncPlannerEngine";
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
 * per-domain upserts inside one transaction -> __lexora_id backfill writes ->
 * pending cleared only after a fully successful run.
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

/** Tabs read per sync, in the order they should be applied. */
const SYNC_TABS: WorkbookTab[] = [
  "Nhật ký nhiệm vụ",
  "Thông tin lớp học",
  "Quản lý giáo trình",
  "Bảng theo dõi bài tập",
  "Danh sách tài liệu đọc",
  "Habit Tracker",
  "Danh sách việc cần làm",
  "Hoạt động",
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

export async function syncPlannerConnection(
  connectionId: number,
  trigger: PlannerSyncTrigger,
  api: GoogleWorkspaceApi,
): Promise<PlannerSyncResult> {
  const [connection] = await db.select().from(studyPlannerConnections).where(eq(studyPlannerConnections.id, connectionId)).limit(1);
  if (!connection || !connection.enabled || connection.status === "disconnected") return { status: "skipped" };

  const plans = SYNC_TABS.map(planFor).filter((plan): plan is TabPlan => plan != null);
  // 1) Durable pending before any long work.
  await markPlannerSyncPending(connectionId, trigger);
  const runId = await startPlannerSyncRun(connectionId, trigger);
  try {
    // 2) One lock per planner: webhook / manual / cron never overlap.
    await acquirePlannerSyncLock(connectionId, `planner_${trigger}`);
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
    // 3) One read per tab; no per-cell requests.
    const valuesByTab = new Map<string, SheetsValue | undefined>();
    await Promise.all(
      plans.map(async (plan) => {
        const range = `'${plan.tab.replace(/'/g, "''")}'!A1:BZ${Math.max(plan.dataFrom, plan.dataTo ?? plan.dataFrom + 2000)}`;
        const values = await api.readValues(connection.spreadsheetId, range);
        valuesByTab.set(plan.tab, values);
      }),
    );

    // 4) Upserts in one transaction so a failure leaves no partial domain state.
    await db.transaction(async (tx) => {
      for (const plan of plans) {
        const values = valuesByTab.get(plan.tab);
        if (values === undefined) continue; // tab read failed: touch nothing
        const grid = gridFromPlannerValues({ tab: plan.tab, values, dataFrom: plan.dataFrom, dataTo: plan.dataTo, columns: plan.columns });
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

async function runDomainSync(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], connectionId: number, plan: TabPlan, grid: ReturnType<typeof gridFromPlannerValues>) {
  switch (plan.tab) {
    case "Nhật ký nhiệm vụ":
    case "Kế hoạch ngày & IELTS":
      return syncPlannerTasksFromGrid(tx, connectionId, grid, plan.metadataColumn);
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

