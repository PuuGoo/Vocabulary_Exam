import { asc, and, eq, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  googleSheetConnections, googleSheetRowMappings, googleSheetSyncChannels, googleSheetSyncLocks,
  googleSheetSyncPending, googleSheetSyncRuns, words,
} from "@/db/schema";
import { writeAdminAudit } from "@/lib/adminAudit";
import { GoogleSheetsError, isRetryableCode } from "@/lib/googleSheets/errors";
import { buildRangeA1 } from "@/lib/googleSheets/spreadsheet";

export const SYNC_LOCK_TTL_MS = 5 * 60 * 1000;

export type SyncTrigger = "manual" | "webhook" | "cron" | "initial" | "lexora";

export class SyncInProgressError extends Error {
  constructor() {
    super("Sync already in progress");
    this.name = "SyncInProgressError";
  }
}

/**
 * Connection-level lock. A webhook, a manual "Sync now" and the reconcile cron
 * can never mutate the same connection concurrently; a crashed process releases
 * the lock after SYNC_LOCK_TTL_MS.
 */
export async function acquireConnectionLock(connectionId: number, owner: string, ttlMs = SYNC_LOCK_TTL_MS): Promise<void> {
  const now = new Date();
  const until = new Date(now.getTime() + ttlMs);
  const updated = await db
    .update(googleSheetSyncLocks)
    .set({ lockedAt: now, lockedUntil: until, lockedBy: owner })
    .where(and(eq(googleSheetSyncLocks.connectionId, connectionId), lt(googleSheetSyncLocks.lockedUntil, now)))
    .returning({ connectionId: googleSheetSyncLocks.connectionId });
  if (updated.length) return;
  const inserted = await db
    .insert(googleSheetSyncLocks)
    .values({ connectionId, lockedAt: now, lockedUntil: until, lockedBy: owner })
    .onConflictDoNothing({ target: googleSheetSyncLocks.connectionId })
    .returning({ connectionId: googleSheetSyncLocks.connectionId });
  if (!inserted.length) throw new SyncInProgressError();
}

export async function releaseConnectionLock(connectionId: number) {
  await db.delete(googleSheetSyncLocks).where(eq(googleSheetSyncLocks.connectionId, connectionId));
}

export async function markSyncPending(connectionId: number, reason: string) {
  await db
    .insert(googleSheetSyncPending)
    .values({ connectionId, pending: true, pendingReason: reason, pendingAt: new Date(), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: googleSheetSyncPending.connectionId,
      set: { pending: true, pendingReason: reason, pendingAt: new Date(), updatedAt: new Date() },
    });
}

export async function clearSyncPending(connectionId: number) {
  await db
    .insert(googleSheetSyncPending)
    .values({ connectionId, pending: false, pendingAt: null, updatedAt: new Date() })
    .onConflictDoUpdate({ target: googleSheetSyncPending.connectionId, set: { pending: false, pendingAt: null, updatedAt: new Date() } });
}

export async function takePendingConnections(limit: number) {
  return db
    .select({ connectionId: googleSheetSyncPending.connectionId })
    .from(googleSheetSyncPending)
    .where(eq(googleSheetSyncPending.pending, true))
    .limit(limit);
}

export async function recordNotificationState(channelId: string, resourceId: string, messageNumber: number) {
  const [channel] = await db.select().from(googleSheetSyncChannels).where(eq(googleSheetSyncChannels.channelId, channelId)).limit(1);
  if (!channel) return null;
  // Out-of-order and duplicate notifications must not trigger a second sync.
  if (channel.resourceId && channel.resourceId !== resourceId) return null;
  if (channel.lastMessageNumber != null && messageNumber <= channel.lastMessageNumber) return null;
  await db
    .update(googleSheetSyncChannels)
    .set({ lastMessageNumber: messageNumber, resourceId: channel.resourceId || resourceId, updatedAt: new Date() })
    .where(eq(googleSheetSyncChannels.id, channel.id));
  return channel;
}

export async function startSyncRun(connectionId: number, triggerType: SyncTrigger) {
  const [run] = await db.insert(googleSheetSyncRuns).values({ connectionId, triggerType, status: "running" }).returning({ id: googleSheetSyncRuns.id });
  return run.id;
}

export async function finishSyncRun(runId: number, status: "success" | "error", values?: {
  rowsRead?: number; rowsCreated?: number; rowsUpdated?: number; rowsDeleted?: number; rowsUnchanged?: number;
  rowsSkipped?: number; duplicateCount?: number; validationErrorCount?: number; errorMessage?: string; metadata?: Record<string, unknown>;
}) {
  await db.update(googleSheetSyncRuns).set({
    status,
    finishedAt: new Date(),
    ...(values?.rowsRead != null ? { rowsRead: values.rowsRead } : {}),
    ...(values?.rowsCreated != null ? { rowsCreated: values.rowsCreated } : {}),
    ...(values?.rowsUpdated != null ? { rowsUpdated: values.rowsUpdated } : {}),
    ...(values?.rowsDeleted != null ? { rowsDeleted: values.rowsDeleted } : {}),
    ...(values?.rowsUnchanged != null ? { rowsUnchanged: values.rowsUnchanged } : {}),
    ...(values?.rowsSkipped != null ? { rowsSkipped: values.rowsSkipped } : {}),
    ...(values?.duplicateCount != null ? { duplicateCount: values.duplicateCount } : {}),
    ...(values?.validationErrorCount != null ? { validationErrorCount: values.validationErrorCount } : {}),
    ...(values?.errorMessage ? { errorMessage: values.errorMessage } : {}),
    ...(values?.metadata ? { metadata: JSON.stringify(values.metadata) } : {}),
  }).where(eq(googleSheetSyncRuns.id, runId));
}

export async function markConnectionSyncState(connectionId: number, outcome: { ok: true } | { ok: false; error: string; retryable: boolean }) {
  const now = new Date();
  if (outcome.ok) {
    await db.update(googleSheetConnections).set({ status: "connected", lastSyncedAt: now, lastSuccessfulSyncAt: now, lastError: null, updatedAt: now }).where(eq(googleSheetConnections.id, connectionId));
  } else {
    await db.update(googleSheetConnections).set({
      status: outcome.retryable ? "connected" : "error",
      lastSyncedAt: now,
      lastErrorAt: now,
      lastError: outcome.error.slice(0, 2000),
      updatedAt: now,
    }).where(eq(googleSheetConnections.id, connectionId));
  }
}

export function connectionRangeA1(connection: { sheetTitle: string; templateType: string; templateVersion: number; rangeA1: string }) {
  return connection.rangeA1;
}

export function rangeForWords(sheetTitle: string, fieldCount: number) {
  return buildRangeA1(sheetTitle, fieldCount, 50000);
}

export async function setConnectionStatus(connectionId: number, status: "connected" | "syncing" | "paused" | "error" | "disconnected", patch?: { enabled?: boolean }) {
  await db.update(googleSheetConnections).set({ status, ...(patch?.enabled != null ? { enabled: patch.enabled } : {}), updatedAt: new Date() }).where(eq(googleSheetConnections.id, connectionId));
}

export async function loadConnectionOrThrow(connectionId: number) {
  const [connection] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, connectionId)).limit(1);
  if (!connection) throw new GoogleSheetsError("Không tìm thấy kết nối Google Sheet.", "SHEET_NOT_FOUND", { retryable: false });
  return connection;
}

export async function listConnectionsForSet(setId: number) {
  return db
    .select()
    .from(googleSheetConnections)
    .where(eq(googleSheetConnections.setId, setId))
    .orderBy(asc(googleSheetConnections.id));
}

export async function recentRuns(connectionId: number, limit: number) {
  return db.select().from(googleSheetSyncRuns).where(eq(googleSheetSyncRuns.connectionId, connectionId)).orderBy(sql`${googleSheetSyncRuns.startedAt} DESC`).limit(limit);
}

export const createConnectionSchema = z.object({
  setId: z.number().int().positive(),
  deleteBehavior: z.enum(["archive", "delete", "ignore"]).optional(),
});

export const previewSchema = z.object({
  setId: z.number().int().positive().optional(),
  spreadsheetUrl: z.string().trim().min(1).max(2048).optional(),
});

export const connectExistingSchema = z.object({
  setId: z.number().int().positive(),
  spreadsheetUrl: z.string().trim().min(1).max(2048),
  sheetTitle: z.string().trim().min(1).max(255),
  deleteBehavior: z.enum(["archive", "delete", "ignore"]).optional(),
});

export const patchConnectionSchema = z.object({
  enabled: z.boolean().optional(),
  deleteBehavior: z.enum(["archive", "delete", "ignore"]).optional(),
  sheetTitle: z.string().trim().min(1).max(255).optional(),
});

export { isRetryableCode, and, eq, inArray, words, googleSheetRowMappings, googleSheetConnections };
