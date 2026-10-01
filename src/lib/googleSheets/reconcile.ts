import { eq } from "drizzle-orm";
import { db } from "@/db";
import { googleSheetConnections } from "@/db/schema";
import { takePendingConnections } from "@/lib/googleSheets/store";
import { syncConnection, SyncInProgressError } from "@/lib/googleSheets/sheetLifecycle";
import type { SyncTrigger } from "@/lib/googleSheets/store";

export type ReconcileItem = { connectionId: number; status: "synced" | "locked" | "skipped" | "error"; error?: string };

/**
 * Sync one connection that is already known to be pending.
 *
 * The connection-level lock is the single guard used by every trigger (webhook,
 * manual "Sync now", daily cron), so two of them can never sync the same
 * connection at the same time. A locked connection keeps its pending flag, so
 * the next trigger picks it up.
 */
export async function runPendingConnection(connectionId: number, trigger: SyncTrigger): Promise<ReconcileItem> {
  const [connection] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, connectionId)).limit(1);
  if (!connection?.enabled || connection.status === "disconnected") return { connectionId, status: "skipped" };
  try {
    await syncConnection(connectionId, trigger);
    return { connectionId, status: "synced" };
  } catch (error) {
    if (error instanceof SyncInProgressError || (error instanceof Error && error.name === "SyncInProgressError")) {
      return { connectionId, status: "locked" };
    }
    return { connectionId, status: "error", error: error instanceof Error ? error.message : "unknown" };
  }
}

/**
 * Drain the DB-backed pending queue. Used by the daily reconciliation cron as a
 * safety net for webhooks that never arrived, and to retry transient failures.
 *
 * Near-real-time sync does not depend on this frequency: the Drive webhook runs
 * the sync itself, so a once-a-day cron is enough (Vercel Hobby rejects cron
 * schedules that run more than once per day).
 */
export async function reconcilePendingGoogleSheets(options?: { trigger?: SyncTrigger; limit?: number }): Promise<ReconcileItem[]> {
  const trigger = options?.trigger ?? "cron";
  const pending = await takePendingConnections(options?.limit ?? 25);
  const results: ReconcileItem[] = [];
  for (const { connectionId } of pending) {
    results.push(await runPendingConnection(connectionId, trigger));
  }
  return results;
}