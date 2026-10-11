import { eq, sql, and } from "drizzle-orm";

import { db } from "@/db";
import { studyPlannerConnections, studyPlannerSyncPending } from "@/db/schema";
import { takePendingPlannerConnections } from "@/lib/studyPlanner/store";
import type { PlannerSyncTrigger } from "@/lib/studyPlanner/store";
import { syncPlannerConnection } from "@/lib/studyPlanner/sync";
import { createGoogleWorkspaceApi } from "@/lib/googleSheets/client";
import { loadGoogleToken } from "@/lib/googleSheets/auth";

export type PlannerReconcileItem = { connectionId: number; status: "synced" | "partial" | "locked" | "skipped" | "error"; error?: string };

/**
 * Sync one planner that is already known to be pending (or stale).
 *
 * The planner lock is the same guard the vocabulary engine uses, so a webhook,
 * a manual sync and the cron cannot overwrite the same planner concurrently.
 * A locked planner keeps its pending flag for the next trigger.
 */
export async function runPendingPlannerConnection(connectionId: number, trigger: PlannerSyncTrigger): Promise<PlannerReconcileItem> {
  const [connection] = await db.select().from(studyPlannerConnections).where(eq(studyPlannerConnections.id, connectionId)).limit(1);
  if (!connection?.enabled || connection.status === "disconnected") return { connectionId, status: "skipped" };

  const token = await loadGoogleToken(connection.userId);
  if (!token?.refreshToken) return { connectionId, status: "error", error: "OAUTH_REVOKED: cần kết nối lại Google" };

  try {
    const api = createGoogleWorkspaceApi(token as unknown as Parameters<typeof createGoogleWorkspaceApi>[0]);
    const result = await syncPlannerConnection(connectionId, trigger, api);
    return { connectionId, status: result.status === "synced" ? "synced" : result.status === "partial" ? "partial" : result.status === "locked" ? "locked" : result.status === "skipped" ? "skipped" : "error", error: result.error };
  } catch (error) {
    return { connectionId, status: "error", error: error instanceof Error ? error.message : "unknown" };
  }
}

/**
 * Drain the durable pending queue plus stale planners, then sync each once.
 * This is the safety net for notifications that never arrived; near-real-time
 * sync still runs inside the webhook itself.
 */
export async function reconcilePendingPlanner(options?: { trigger?: PlannerSyncTrigger; limit?: number }): Promise<PlannerReconcileItem[]> {
  const trigger = options?.trigger ?? "cron";
  const limit = options?.limit ?? 25;
  const pending = await takePendingPlannerConnections(limit);
  const stale = await db
    .select({ connectionId: studyPlannerConnections.id })
    .from(studyPlannerConnections)
    .where(
      and(
        eq(studyPlannerConnections.enabled, true),
        sql`(${studyPlannerConnections.lastSyncedAt} is null or ${studyPlannerConnections.lastSyncedAt} < now() - interval '15 minutes')`,
      ),
    )
    .limit(limit);
  const candidates = [...new Map([...pending, ...stale].map((item) => [item.connectionId, item])).values()].slice(0, limit);
  const results: PlannerReconcileItem[] = [];
  for (const { connectionId } of candidates) {
    results.push(await runPendingPlannerConnection(connectionId, trigger));
  }
  return results;
}

export { studyPlannerSyncPending };

