import { and, asc, eq, inArray, lt, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  studyPlannerConnections,
  studyPlannerSyncChannels,
  studyPlannerSyncLocks,
  studyPlannerSyncPending,
  studyPlannerSyncRevisions,
  studyPlannerSyncRuns,
} from "@/db/schema";

/**
 * Planner-side sync infrastructure, mirroring src/lib/googleSheets/store.ts.
 *
 * The vocabulary tables are never read or written here: planner state lives in
 * study_planner_* only, so a planner sync can never disturb word data.
 */

export const PLANNER_SYNC_LOCK_TTL_MS = 5 * 60 * 1000;

export type PlannerSyncTrigger = "manual" | "webhook" | "cron" | "initial" | "lexora";

export class PlannerSyncInProgressError extends Error {
  constructor() {
    super("Study Planner sync already in progress");
    this.name = "PlannerSyncInProgressError";
  }
}

/** One lock per planner: webhook, manual sync and cron can never race. */
export async function acquirePlannerSyncLock(connectionId: number, owner: string, ttlMs = PLANNER_SYNC_LOCK_TTL_MS): Promise<void> {
  const now = new Date();
  const until = new Date(now.getTime() + ttlMs);
  const updated = await db
    .update(studyPlannerSyncLocks)
    .set({ lockedAt: now, lockedUntil: until, lockedBy: owner })
    .where(and(eq(studyPlannerSyncLocks.connectionId, connectionId), lt(studyPlannerSyncLocks.lockedUntil, now)))
    .returning({ connectionId: studyPlannerSyncLocks.connectionId });
  if (updated.length) return;
  const inserted = await db
    .insert(studyPlannerSyncLocks)
    .values({ connectionId, lockedAt: now, lockedUntil: until, lockedBy: owner })
    .onConflictDoNothing({ target: studyPlannerSyncLocks.connectionId })
    .returning({ connectionId: studyPlannerSyncLocks.connectionId });
  if (!inserted.length) throw new PlannerSyncInProgressError();
}

export async function releasePlannerSyncLock(connectionId: number): Promise<void> {
  await db.delete(studyPlannerSyncLocks).where(eq(studyPlannerSyncLocks.connectionId, connectionId));
}

/**
 * Durable pending marker written before a long sync starts. It is only cleared
 * after a fully successful run, so a crash or execution limit leaves work for
 * the next attempt instead of silently dropping it.
 */
export async function markPlannerSyncPending(connectionId: number, reason: string): Promise<void> {
  const now = new Date();
  await db
    .insert(studyPlannerSyncPending)
    .values({ connectionId, pending: true, pendingReason: reason, pendingAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: studyPlannerSyncPending.connectionId,
      set: { pending: true, pendingReason: reason, pendingAt: now, updatedAt: now },
    });
}

export async function clearPlannerSyncPending(connectionId: number, through?: Date): Promise<void> {
  if (through) {
    await db
      .update(studyPlannerSyncPending)
      .set({ pending: false, pendingAt: null, updatedAt: new Date() })
      .where(and(eq(studyPlannerSyncPending.connectionId, connectionId), lte(studyPlannerSyncPending.pendingAt, through)));
    return;
  }
  await db
    .insert(studyPlannerSyncPending)
    .values({ connectionId, pending: false, pendingAt: null, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: studyPlannerSyncPending.connectionId,
      set: { pending: false, pendingAt: null, updatedAt: new Date() },
    });
}

export async function takePendingPlannerConnections(limit: number): Promise<Array<{ connectionId: number }>> {
  return db
    .select({ connectionId: studyPlannerSyncPending.connectionId })
    .from(studyPlannerSyncPending)
    .innerJoin(studyPlannerConnections, eq(studyPlannerConnections.id, studyPlannerSyncPending.connectionId))
    .where(
      and(
        eq(studyPlannerSyncPending.pending, true),
        eq(studyPlannerConnections.enabled, true),
        inArray(studyPlannerConnections.status, ["connected", "syncing"]),
      ),
    )
    .orderBy(asc(studyPlannerSyncPending.pendingAt), asc(studyPlannerSyncPending.connectionId))
    .limit(limit);
}

/**
 * Advance the notification cursor only when the message is strictly newer.
 * Duplicate, delayed or out-of-order Drive notifications are therefore
 * dropped instead of triggering redundant syncs.
 */
export async function recordPlannerNotificationState(
  channelId: string,
  resourceId: string,
  messageNumber: number,
  pendingReason?: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [channel] = await tx.select().from(studyPlannerSyncChannels).where(eq(studyPlannerSyncChannels.channelId, channelId)).limit(1);
    if (!channel) return false;
    // A resource mismatch means the notification belongs to a different file.
    if (channel.resourceId && channel.resourceId !== resourceId) return false;
    if (channel.lastMessageNumber != null && messageNumber <= channel.lastMessageNumber) return false;
    const advanced = await tx
      .update(studyPlannerSyncChannels)
      .set({ lastMessageNumber: messageNumber, resourceId: channel.resourceId || resourceId, lastNotifiedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(studyPlannerSyncChannels.id, channel.id),
          eq(studyPlannerSyncChannels.channelId, channelId),
          eq(studyPlannerSyncChannels.status, "active"),
          sql`(${studyPlannerSyncChannels.lastMessageNumber} is null or ${studyPlannerSyncChannels.lastMessageNumber} < ${messageNumber})`,
        ),
      )
      .returning();
    if (advanced[0] && pendingReason) {
      const now = new Date();
      await tx
        .insert(studyPlannerSyncPending)
        .values({ connectionId: channel.connectionId, pending: true, pendingReason, pendingAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: studyPlannerSyncPending.connectionId,
          set: { pending: true, pendingReason, pendingAt: now, updatedAt: now },
        });
    }
    return Boolean(advanced[0]);
  });
}

export async function startPlannerSyncRun(connectionId: number, triggerType: PlannerSyncTrigger): Promise<number> {
  const [run] = await db
    .insert(studyPlannerSyncRuns)
    .values({ connectionId, triggerType, status: "running" })
    .returning({ id: studyPlannerSyncRuns.id });
  return run.id;
}

export async function finishPlannerSyncRun(
  runId: number,
  status: "success" | "partial" | "error",
  values?: {
    rowsRead?: number;
    rowsCreated?: number;
    rowsUpdated?: number;
    rowsDeleted?: number;
    rowsUnchanged?: number;
    conflictCount?: number;
    errorMessage?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await db
    .update(studyPlannerSyncRuns)
    .set({
      status,
      finishedAt: new Date(),
      ...(values?.rowsRead != null ? { rowsRead: values.rowsRead } : {}),
      ...(values?.rowsCreated != null ? { rowsCreated: values.rowsCreated } : {}),
      ...(values?.rowsUpdated != null ? { rowsUpdated: values.rowsUpdated } : {}),
      ...(values?.rowsDeleted != null ? { rowsDeleted: values.rowsDeleted } : {}),
      ...(values?.rowsUnchanged != null ? { rowsUnchanged: values.rowsUnchanged } : {}),
      ...(values?.conflictCount != null ? { conflictCount: values.conflictCount } : {}),
      ...(values?.errorMessage ? { errorMessage: values.errorMessage } : {}),
      ...(values?.metadata ? { metadata: JSON.stringify(values.metadata) } : {}),
    })
    .where(eq(studyPlannerSyncRuns.id, runId));
}

export async function markPlannerConnectionSyncState(
  connectionId: number,
  outcome: { ok: true; partial?: boolean } | { ok: false; error: string; retryable: boolean },
): Promise<void> {
  const now = new Date();
  if (outcome.ok) {
    await db
      .update(studyPlannerConnections)
      .set({
        status: "connected",
        lastSyncedAt: now,
        ...(outcome.partial ? {} : { lastSuccessfulSyncedAt: now }),
        lastError: null,
        updatedAt: now,
      })
      .where(eq(studyPlannerConnections.id, connectionId));
    return;
  }
  await db
    .update(studyPlannerConnections)
    .set({
      status: outcome.retryable ? "connected" : "error",
      lastSyncedAt: now,
      lastErrorAt: now,
      lastError: outcome.error.slice(0, 2000),
      updatedAt: now,
    })
    .where(eq(studyPlannerConnections.id, connectionId));
}

/**
 * Monotonic revision counter. The web UI polls it to learn that a Sheet edit
 * reached PostgreSQL; polling itself never triggers synchronization.
 */
export async function bumpPlannerRevision(connectionId: number, reason: string): Promise<number> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ revision: studyPlannerSyncRevisions.revision })
      .from(studyPlannerSyncRevisions)
      .where(eq(studyPlannerSyncRevisions.connectionId, connectionId))
      .orderBy(asc(studyPlannerSyncRevisions.revision))
      .limit(1);
    const next = (current?.revision ?? 0) + 1;
    await tx
      .insert(studyPlannerSyncRevisions)
      .values({ connectionId, revision: next, reason, syncedAt: new Date() })
      .onConflictDoNothing();
    return next;
  });
}

export async function currentPlannerRevision(connectionId: number): Promise<number> {
  const rows = await db
    .select({ revision: studyPlannerSyncRevisions.revision })
    .from(studyPlannerSyncRevisions)
    .where(eq(studyPlannerSyncRevisions.connectionId, connectionId))
    .orderBy(asc(studyPlannerSyncRevisions.revision));
  return rows[rows.length - 1]?.revision ?? 0;
}

