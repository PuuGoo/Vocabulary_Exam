import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { studyPlannerConnections, studyPlannerWriteQueue } from "@/db/schema";
import type { GoogleWorkspaceApi } from "@/lib/googleSheets/api";
import { fingerprintPlannerRecord, plannerFingerprintKeys } from "@/lib/studyPlanner/fingerprint";
import { WORKBOOK_RANGES, type WorkbookTab } from "@/lib/studyPlanner/workbookMap";

/**
 * Phase 4.3 — Web -> Sheet write queue.
 *
 * A Lexora web edit writes PostgreSQL and enqueues one Sheets range. The
 * queue then writes only that range, not the whole tab. The expected
 * fingerprint lets the webhook notice that already matches and treat the
 * resulting Drive notification as a no-op instead of looping Sheet -> DB ->
 * Sheet forever.
 *
 * Only mapped source ranges are ever queued; derived cells are never enqueued.
 */

export type PlannerWriteQueueInput = {
  connectionId: number;
  tab: WorkbookTab;
  /** Column letter + row, e.g. { A: "Done", B: "Toan" } at row 7. */
  valuesByColumn: Record<string, string | number | boolean | null>;
  rowNumber: number;
  /** Plain record values for the fingerprint of this row (pre-normalized). */
  fingerprintValues: Record<string, unknown>;
  domain: "course" | "task" | "curriculum" | "assignment" | "reading" | "todo" | "activity" | "habit" | "settings";
};

/**
 * Enqueue one web edit for later flushing. Must be called inside the same
 * PostgreSQL transaction that wrote the planner row so the two never diverge.
 */
export function queuePlannerWrite(input: PlannerWriteQueueInput, tx?: never): never;
export function queuePlannerWrite(input: PlannerWriteQueueInput): Promise<{ id: number }>;
export async function queuePlannerWrite(input: PlannerWriteQueueInput, _tx?: unknown): Promise<{ id: number }> {
  const range = WORKBOOK_RANGES[input.tab];
  if (!range) throw new Error(`Planner tab ${input.tab} is not writable`);
  const sourceLetters = new Set([...range.sourceColumns, ...(range.controlColumns ?? [])]);
  for (const letter of Object.keys(input.valuesByColumn)) {
    if (!sourceLetters.has(letter)) throw new Error(`Column ${letter} on tab ${input.tab} is derived or outside the writable range`);
  }

  const keys = plannerFingerprintKeys(input.domain);
  const expectedFingerprint = keys.length ? fingerprintPlannerRecord(input.domain, input.fingerprintValues) : null;

  // One cell per column at rowNumber; columns that are not part of this edit
  // are simply not included. The caller is responsible for coalescing multiple
  // columns of the same row into a contiguous range upstream.
  const sortedLetters = Object.keys(input.valuesByColumn).sort((a, b) => a.localeCompare(b));
  const rangeA1 = `'${input.tab.replace(/'/g, "''")}'!${sortedLetters[0]}${input.rowNumber}:${sortedLetters[sortedLetters.length - 1]}${input.rowNumber}`;
  const values = [sortedLetters.map((letter) => input.valuesByColumn[letter])];

  const [row] = await db
    .insert(studyPlannerWriteQueue)
    .values({
      connectionId: input.connectionId,
      rangeA1,
      valuesJson: JSON.stringify(values),
      expectedFingerprint,
      status: "pending",
      attempts: 0,
    })
    .returning({ id: studyPlannerWriteQueue.id });
  return { id: row.id };
}

type QueueRow = typeof studyPlannerWriteQueue.$inferSelect;

export async function takePendingPlannerWrites(connectionId: number, limit = 25): Promise<QueueRow[]> {
  return db
    .select()
    .from(studyPlannerWriteQueue)
    .where(and(eq(studyPlannerWriteQueue.connectionId, connectionId), eq(studyPlannerWriteQueue.status, "pending")))
    .orderBy(studyPlannerWriteQueue.createdAt)
    .limit(limit);
}

/** Flush at most `limit` pending writes for one connection via the Google API. */
export async function flushPlannerWriteQueue(api: GoogleWorkspaceApi, connectionId: number, limit = 25): Promise<{ flushed: number; failed: number }> {
  const [connection] = await db
    .select({ id: studyPlannerConnections.id, spreadsheetId: studyPlannerConnections.spreadsheetId })
    .from(studyPlannerConnections)
    .where(eq(studyPlannerConnections.id, connectionId))
    .limit(1);
  if (!connection) throw new Error("Planner connection not found");
  const pending = await takePendingPlannerWrites(connectionId, limit);
  let flushed = 0, failed = 0;
  for (const item of pending) {
    const values = JSON.parse(item.valuesJson) as (string | number | boolean | null)[][];
    try {
      if (api.batchWriteValues) {
        await api.batchWriteValues(connection.spreadsheetId, [{ rangeA1: item.rangeA1, values, parseFormulas: false }]);
      } else {
        await api.writeValues(connection.spreadsheetId, item.rangeA1, values);
      }
      await db.update(studyPlannerWriteQueue).set({ status: "ok", updatedAt: new Date() }).where(eq(studyPlannerWriteQueue.id, item.id));
      flushed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "write_failed";
      await db
        .update(studyPlannerWriteQueue)
        .set({ status: "error", lastError: message.slice(0, 2000), attempts: (item.attempts ?? 0) + 1, updatedAt: new Date() })
        .where(eq(studyPlannerWriteQueue.id, item.id));
      failed += 1;
    }
  }
  return { flushed, failed };
}

/** Test-only: drop every queued write for a connection. */
export async function clearPlannerWriteQueue(connectionId: number): Promise<void> {
  await db.delete(studyPlannerWriteQueue).where(eq(studyPlannerWriteQueue.connectionId, connectionId));
}

