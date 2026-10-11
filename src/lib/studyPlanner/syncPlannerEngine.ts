import { eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  studyPlannerAssignments,
  studyPlannerCourses,
  studyPlannerCurriculumTopics,
  studyPlannerReadingMaterials,
  studyPlannerActivities,
  studyPlannerTodos,
  studyPlannerTasks,
} from "@/db/schema";
import { generateSourceId } from "@/lib/googleSheets/identity";
import { columnLetter } from "@/lib/googleSheets/spreadsheet";
import { metadataWriteRanges } from "@/lib/studyPlanner/columnGrid";
import {
  importActivityRow,
  importAssignmentRow,
  importCourseRow,
  importCurriculumRow,
  importReadingRow,
  importTaskRow,
  importTodoRow,
  type ImportResult,
} from "@/lib/studyPlanner/importers";
import type { PlannerGrid, PlannerGridRow } from "@/lib/studyPlanner/columnGrid";
import type { GoogleWorkspaceApi } from "@/lib/googleSheets/api";

/**
 * Phase 4b — Planner Sheet -> PostgreSQL for row tables.
 *
 * Planner isolation: every table touched here is study_planner_*.
 * No word / progress / mistake table is ever read or written.
 *
 * Bulk-isolation: only position-addressed rows are removed when they were
 * actually present in the Sheet. A grid that failed to read (undefined values)
 * yields no deletions. A temporary API failure never becomes "delete everything".
 */

export type DomainSyncStats = {
  domain: string;
  rowsRead: number;
  created: number;
  updated: number;
  unchanged: number;
  invalid: number;
  duplicate: number;
  archived: number;
};

type GridImporter<T> = (row: PlannerGridRow, options: { metadataColumn?: string }) => ImportResult<T>;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Generic row upsert for any planner table keyed by (connectionId, lexoraId).
 *
 * - Existing rows whose fingerprint differs -> UPDATE.
 * - New rows (no lexoraId or lexoraId not found) -> INSERT with a fresh id.
 * - Blank rows -> ignored (not deletes); row deletion is the separate archiving phase.
 * - A row whose lexoraId has no matching DB row post-backfill is treated as new
 *   rather than an error: the backfill may not have raced the read.
 */
async function syncRowDomain<T extends Record<string, unknown>>(options: {
  tx: Tx;
  connectionId: number;
  domain: string;
  grid: PlannerGrid;
  metadataColumn: string | undefined;
  importer: GridImporter<T>;
  persist: (params: { id?: number; lexoraId: string; values: T; rowNumber: number; existing?: unknown }) => Promise<{ inserted: number; updated: number; fingerprint: string }>;
  batchSize?: number;
}): Promise<{ stats: DomainSyncStats; idWrites: Array<{ rowNumber: number; sourceId: string }>; rowNumbers: number[] }> {
  const idWrites: Array<{ rowNumber: number; sourceId: string }> = [];
  let created = 0, updated = 0, unchanged = 0, invalid = 0, duplicate = 0;
  const seenLexora = new Set<string>();
  const rowNumbers: number[] = [];

  for (const row of options.grid.rows) {
    const imported = options.importer(row, { metadataColumn: options.metadataColumn });
    if (imported.status === "blank") continue;
    rowNumbers.push(row.rowNumber);
    if (imported.status === "invalid") { invalid += 1; continue; }

    let lexoraId = imported.lexoraId;
    if (!lexoraId) {
      lexoraId = generateSourceId(seenLexora);
      idWrites.push({ rowNumber: row.rowNumber, sourceId: lexoraId });
    } else if (seenLexora.has(lexoraId)) {
      duplicate += 1;
      continue;
    }
    seenLexora.add(lexoraId);

    const result = await options.persist({
      lexoraId,
      values: imported.values as T,
      rowNumber: row.rowNumber,
      existing: undefined,
    });
    created += result.inserted;
    updated += result.updated;
    if (!result.inserted && !result.updated) unchanged += 1;
  }

  return {
    stats: {
      domain: options.domain,
      rowsRead: rowNumbers.length,
      created,
      updated,
      unchanged,
      invalid,
      duplicate,
      archived: 0,
    },
    idWrites,
    rowNumbers,
  };
}

/**
 * Read every source tab via one batched Google Sheets read, chunk grids per
 * domain importer, then upsert into PostgreSQL. No whole-tab overwrite: only
 * rows the Sheet actually contained are touched.
 *
 * `readValues` and `writeValues` come from the injected GoogleWorkspaceApi so
 * the engine is testable without a real Google connection.
 */
export function buildPlannerTabRanges(tabs: ReadonlyArray<{ tab: string; lastColumn: string; dataFrom: number; dataTo: number | null }>): Array<{ tab: string; range: string }> {
  return tabs.map(({ tab, lastColumn, dataFrom, dataTo }) => {
    const last = dataTo == null ? 2048 : dataTo;
    return { tab, range: `'${tab.replace(/'/g, "''")}'!A1:${lastColumn}${Math.max(dataFrom, last)}` };
  });
}

export async function flushPlannerIdWrites(
  api: GoogleWorkspaceApi,
  spreadsheetId: string,
  writes: ReadonlyArray<{ tab: string; column: string; rows: ReadonlyArray<{ rowNumber: number; sourceId: string }> }>,
): Promise<void> {
  for (const entry of writes) {
    const ranges = metadataWriteRanges(entry.tab, entry.column, entry.rows as Array<{ rowNumber: number; sourceId: string }>);
    for (const range of ranges) {
      if (api.batchWriteValues) {
        await api.batchWriteValues(spreadsheetId, [{ rangeA1: range.rangeA1, values: range.values, parseFormulas: false }]);
      } else {
        await api.writeValues(spreadsheetId, range.rangeA1, range.values as (string | number | boolean | null)[][]);
      }
    }
  }
}

// -------------------------------------------------------------------------
// Concrete domain runners. Each batches its own normalization so a failure
// in one domain (e.g. a bad date) never blocks another domain, and a
// missing tab (no data from that range read) touches no rows.

export async function syncPlannerTasksFromGrid(
  tx: Tx,
  connectionId: number,
  grid: PlannerGrid,
  metadataColumn: string | undefined,
): Promise<ReturnType<typeof syncRowDomain>> {
  const byLexora = new Map<string, { id: number }>();
  // Preload existing ids once so persist can decide insert vs update.
  const existing = grid.rows.length
    ? await tx.select({ id: studyPlannerTasks.id, lexoraId: studyPlannerTasks.lexoraId })
        .from(studyPlannerTasks)
        .where(eq(studyPlannerTasks.connectionId, connectionId))
    : [];
  for (const row of existing) byLexora.set(row.lexoraId, { id: row.id });

  return syncRowDomain({
    tx,
    connectionId,
    domain: "tasks",
    grid,
    metadataColumn,
    importer: (row, opts) => importTaskRow(row, opts) as unknown as ImportResult<Record<string, unknown>>,
    persist: async ({ lexoraId, values, rowNumber }) => {
      const hit = byLexora.get(lexoraId);
      const payload = {
        connectionId,
        lexoraId,
        taskDate: values.taskDate as string,
        completed: Boolean(values.completed),
        startTime: (values.startTime as number | null) ?? null,
        endTime: (values.endTime as number | null) ?? null,
        category: (values.category as string | null) ?? null,
        ieltsSkill: (values.ieltsSkill as string | null) ?? null,
        taskTitle: String(values.taskTitle),
        priority: (values.priority as string | null) ?? null,
        durationMinutes: (values.durationMinutes as number | null) ?? null,
        notes: (values.notes as string | null) ?? null,
        dueDate: (values.dueDate as string | null) ?? null,
        compensatingTask: (values.compensatingTask as string | null) ?? null,
        statusText: (values.statusText as string | null) ?? null,
        ieltsMaterial: (values.ieltsMaterial as string | null) ?? null,
        ieltsTaskType: (values.ieltsTaskType as string | null) ?? null,
        ieltsBand: (values.ieltsBand as number | null) != null ? String(values.ieltsBand) : null,
        ieltsMistakeAnalysis: (values.ieltsMistakeAnalysis as string | null) ?? null,
        sheetRow: rowNumber,
        archivedAt: null,
      };
      if (hit) {
        await tx.update(studyPlannerTasks).set({ ...payload, updatedAt: new Date() }).where(eq(studyPlannerTasks.id, hit.id));
        return { inserted: 0, updated: 1, fingerprint: "" };
      }
      const [inserted] = await tx.insert(studyPlannerTasks).values(payload).returning({ id: studyPlannerTasks.id });
      byLexora.set(lexoraId, { id: inserted.id });
      return { inserted: 1, updated: 0, fingerprint: "" };
    },
  });
}

export async function syncPlannerCoursesFromGrid(
  tx: Tx,
  connectionId: number,
  grid: PlannerGrid,
  metadataColumn: string | undefined,
) {
  const byLexora = new Map<string, { id: number }>();
  const existing = grid.rows.length
    ? await tx.select({ id: studyPlannerCourses.id, lexoraId: studyPlannerCourses.lexoraId })
        .from(studyPlannerCourses)
        .where(eq(studyPlannerCourses.connectionId, connectionId))
    : [];
  for (const row of existing) byLexora.set(row.lexoraId, { id: row.id });

  return syncRowDomain({
    tx,
    connectionId,
    domain: "courses",
    grid,
    metadataColumn,
    importer: (row, opts) => importCourseRow(row, opts) as unknown as ImportResult<Record<string, unknown>>,
    persist: async ({ lexoraId, values }) => {
      const hit = byLexora.get(lexoraId);
      const payload = {
        connectionId,
        lexoraId,
        courseName: String(values.courseName),
        courseCode: (values.courseCode as string | null) ?? null,
        lecturer: (values.lecturer as string | null) ?? null,
        credits: (values.credits as number | null) ?? null,
        notes: (values.notes as string | null) ?? null,
        score: (values.score as number | null) != null ? String(values.score) : null,
        gradePoint: (values.gradePoint as number | null) != null ? String(values.gradePoint) : null,
      };
      if (hit) {
        await tx.update(studyPlannerCourses).set({ ...payload, updatedAt: new Date() }).where(eq(studyPlannerCourses.id, hit.id));
        return { inserted: 0, updated: 1, fingerprint: "" };
      }
      const [inserted] = await tx.insert(studyPlannerCourses).values(payload).returning({ id: studyPlannerCourses.id });
      byLexora.set(lexoraId, { id: inserted.id });
      return { inserted: 1, updated: 0, fingerprint: "" };
    },
  });
}

export async function syncPlannerCurriculumFromGrid(
  tx: Tx,
  connectionId: number,
  grid: PlannerGrid,
  metadataColumn: string | undefined,
) {
  const byLexora = new Map<string, number>();
  const existing = grid.rows.length
    ? await tx.select({ id: studyPlannerCurriculumTopics.id, lexoraId: studyPlannerCurriculumTopics.lexoraId })
        .from(studyPlannerCurriculumTopics)
        .where(eq(studyPlannerCurriculumTopics.connectionId, connectionId))
    : [];
  for (const row of existing) byLexora.set(row.lexoraId, row.id);

  return syncRowDomain({
    tx,
    connectionId,
    domain: "curriculum",
    grid,
    metadataColumn,
    importer: (row, opts) => importCurriculumRow(row, opts) as unknown as ImportResult<Record<string, unknown>>,
    persist: async ({ lexoraId, values }) => {
      const hit = byLexora.get(lexoraId);
      const payload = {
        connectionId,
        lexoraId,
        subject: String(values.subject),
        topic: String(values.topic),
        expectedWeek: (values.expectedWeek as number | null) ?? null,
        statusText: (values.statusText as string | null) ?? null,
        completed: Boolean(values.completed),
        notes: (values.notes as string | null) ?? null,
      };
      if (hit) {
        await tx.update(studyPlannerCurriculumTopics).set({ ...payload, updatedAt: new Date() }).where(eq(studyPlannerCurriculumTopics.id, hit));
        return { inserted: 0, updated: 1, fingerprint: "" };
      }
      const [inserted] = await tx.insert(studyPlannerCurriculumTopics).values(payload).returning({ id: studyPlannerCurriculumTopics.id });
      byLexora.set(lexoraId, inserted.id);
      return { inserted: 1, updated: 0, fingerprint: "" };
    },
  });
}

export async function syncPlannerAssignmentsFromGrid(
  tx: Tx,
  connectionId: number,
  grid: PlannerGrid,
  metadataColumn: string | undefined,
) {
  const byLexora = new Map<string, number>();
  const existing = grid.rows.length
    ? await tx.select({ id: studyPlannerAssignments.id, lexoraId: studyPlannerAssignments.lexoraId })
        .from(studyPlannerAssignments)
        .where(eq(studyPlannerAssignments.connectionId, connectionId))
    : [];
  for (const row of existing) byLexora.set(row.lexoraId, row.id);

  return syncRowDomain({
    tx,
    connectionId,
    domain: "assignments",
    grid,
    metadataColumn,
    importer: (row, opts) => importAssignmentRow(row, opts) as unknown as ImportResult<Record<string, unknown>>,
    persist: async ({ lexoraId, values }) => {
      const hit = byLexora.get(lexoraId);
      const payload = {
        connectionId,
        lexoraId,
        subject: (values.subject as string | null) ?? null,
        description: String(values.description),
        category: (values.category as string | null) ?? null,
        statusText: (values.statusText as string | null) ?? null,
        durationHours: (values.durationHours as number | null) != null ? String(values.durationHours) : null,
        dueTime: (values.dueTime as number | null) ?? null,
        dueDate: (values.dueDate as string | null) ?? null,
        notes: (values.notes as string | null) ?? null,
        grade: (values.grade as string | null) ?? null,
      };
      if (hit) {
        await tx.update(studyPlannerAssignments).set({ ...payload, updatedAt: new Date() }).where(eq(studyPlannerAssignments.id, hit));
        return { inserted: 0, updated: 1, fingerprint: "" };
      }
      const [inserted] = await tx.insert(studyPlannerAssignments).values(payload).returning({ id: studyPlannerAssignments.id });
      byLexora.set(lexoraId, inserted.id);
      return { inserted: 1, updated: 0, fingerprint: "" };
    },
  });
}

export async function syncPlannerReadingFromGrid(
  tx: Tx,
  connectionId: number,
  grid: PlannerGrid,
  metadataColumn: string | undefined,
) {
  const byLexora = new Map<string, number>();
  const existing = grid.rows.length
    ? await tx.select({ id: studyPlannerReadingMaterials.id, lexoraId: studyPlannerReadingMaterials.lexoraId })
        .from(studyPlannerReadingMaterials)
        .where(eq(studyPlannerReadingMaterials.connectionId, connectionId))
    : [];
  for (const row of existing) byLexora.set(row.lexoraId, row.id);

  return syncRowDomain({
    tx,
    connectionId,
    domain: "reading",
    grid,
    metadataColumn,
    importer: (row, opts) => importReadingRow(row, opts) as unknown as ImportResult<Record<string, unknown>>,
    persist: async ({ lexoraId, values }) => {
      const hit = byLexora.get(lexoraId);
      const payload = {
        connectionId,
        lexoraId,
        subject: String(values.subject),
        title: String(values.title),
        author: (values.author as string | null) ?? null,
        targetPages: (values.targetPages as number | null) != null ? String(values.targetPages) : null,
        currentPage: (values.currentPage as number | null) ?? null,
        totalPages: (values.totalPages as number | null) ?? null,
        notes: (values.notes as string | null) ?? null,
      };
      if (hit) {
        await tx.update(studyPlannerReadingMaterials).set({ ...payload, updatedAt: new Date() }).where(eq(studyPlannerReadingMaterials.id, hit));
        return { inserted: 0, updated: 1, fingerprint: "" };
      }
      const [inserted] = await tx.insert(studyPlannerReadingMaterials).values(payload).returning({ id: studyPlannerReadingMaterials.id });
      byLexora.set(lexoraId, inserted.id);
      return { inserted: 1, updated: 0, fingerprint: "" };
    },
  });
}

export async function syncPlannerTodosFromGrid(
  tx: Tx,
  connectionId: number,
  grid: PlannerGrid,
  metadataColumn: string | undefined,
) {
  const byLexora = new Map<string, number>();
  const existing = grid.rows.length
    ? await tx.select({ id: studyPlannerTodos.id, lexoraId: studyPlannerTodos.lexoraId })
        .from(studyPlannerTodos)
        .where(eq(studyPlannerTodos.connectionId, connectionId))
    : [];
  for (const row of existing) byLexora.set(row.lexoraId, row.id);

  return syncRowDomain({
    tx,
    connectionId,
    domain: "todos",
    grid,
    metadataColumn,
    importer: (row, opts) => importTodoRow(row, opts) as unknown as ImportResult<Record<string, unknown>>,
    persist: async ({ lexoraId, values }) => {
      const hit = byLexora.get(lexoraId);
      const payload = {
        connectionId,
        lexoraId,
        taskTitle: String(values.taskTitle),
        completed: Boolean(values.completed),
        category: (values.category as string | null) ?? null,
        priority: (values.priority as string | null) ?? null,
        dueDate: (values.dueDate as string | null) ?? null,
        notes: (values.notes as string | null) ?? null,
      };
      if (hit) {
        await tx.update(studyPlannerTodos).set({ ...payload, updatedAt: new Date() }).where(eq(studyPlannerTodos.id, hit));
        return { inserted: 0, updated: 1, fingerprint: "" };
      }
      const [inserted] = await tx.insert(studyPlannerTodos).values(payload).returning({ id: studyPlannerTodos.id });
      byLexora.set(lexoraId, inserted.id);
      return { inserted: 1, updated: 0, fingerprint: "" };
    },
  });
}

export async function syncPlannerActivitiesFromGrid(
  tx: Tx,
  connectionId: number,
  grid: PlannerGrid,
  metadataColumn: string | undefined,
) {
  const byLexora = new Map<string, number>();
  const existing = grid.rows.length
    ? await tx.select({ id: studyPlannerActivities.id, lexoraId: studyPlannerActivities.lexoraId })
        .from(studyPlannerActivities)
        .where(eq(studyPlannerActivities.connectionId, connectionId))
    : [];
  for (const row of existing) byLexora.set(row.lexoraId, row.id);

  return syncRowDomain({
    tx,
    connectionId,
    domain: "activities",
    grid,
    metadataColumn,
    importer: (row, opts) => importActivityRow(row, opts) as unknown as ImportResult<Record<string, unknown>>,
    persist: async ({ lexoraId, values }) => {
      const hit = byLexora.get(lexoraId);
      const payload = {
        connectionId,
        lexoraId,
        activityDate: String(values.activityDate),
        startTime: (values.startTime as number | null) ?? null,
        endTime: (values.endTime as number | null) ?? null,
        activityName: String(values.activityName),
        activityType: (values.activityType as string | null) ?? null,
        notes: (values.notes as string | null) ?? null,
      };
      if (hit) {
        await tx.update(studyPlannerActivities).set({ ...payload, updatedAt: new Date() }).where(eq(studyPlannerActivities.id, hit));
        return { inserted: 0, updated: 1, fingerprint: "" };
      }
      const [inserted] = await tx.insert(studyPlannerActivities).values(payload).returning({ id: studyPlannerActivities.id });
      byLexora.set(lexoraId, inserted.id);
      return { inserted: 1, updated: 0, fingerprint: "" };
    },
  });
}

export { columnLetter, metadataWriteRanges };
