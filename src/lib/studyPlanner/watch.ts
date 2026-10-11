import { eq } from "drizzle-orm";

import { db } from "@/db";
import { studyPlannerConnections, studyPlannerSyncChannels } from "@/db/schema";
import { WATCH_CHANNEL_RENEW_THRESHOLD_MS } from "@/lib/googleSheets/api";
import type { GoogleWorkspaceApi, GoogleWorkspaceApiFactory } from "@/lib/googleSheets/api";
import { hashChannelToken } from "@/lib/googleSheets/channelToken";
import { loadGoogleToken } from "@/lib/googleSheets/auth";
import { createGoogleWorkspaceApi } from "@/lib/googleSheets/client";
import { writeAdminAudit } from "@/lib/adminAudit";
import { acquirePlannerSyncLock, releasePlannerSyncLock } from "@/lib/studyPlanner/store";
import { replaceWatchSafely } from "@/lib/googleSheets/watchReplacement";

/**
 * Planner watch channels — same contract as vocabulary channels (Phase 5.1).
 *
 * Planner notifications share the Google Drive channel id, but they reference a
 * different PostgreSQL connection row (study_planner_connections) and a
 * different channel table (study_planner_sync_channels). A vocabulary-only
 * webhook that queries google_sheet_sync_channels would therefore treat a
 * valid planner notification as "unknown_channel": the two namespaces must be
 * checked explicitly.
 */

export async function ensurePlannerWatchChannel(
  api: GoogleWorkspaceApi,
  connection: { id: number; spreadsheetId: string; userId: number },
  resourceId: string,
): Promise<ReturnType<GoogleWorkspaceApi["createWatchChannel"]>> {
  const [existing] = await db
    .select()
    .from(studyPlannerSyncChannels)
    .where(eq(studyPlannerSyncChannels.connectionId, connection.id) as unknown as ReturnType<typeof eq>)
    .limit(1)
    // Fall back for older DBs where status is still "active" only.
    // The Narrower query above without the status filter returns null only when
    // there truly is no channel, which is also correct.
    .then((rows) => rows.filter((row) => (row as { status: string }).status === "active"));
  if (existing) await db.delete(studyPlannerSyncChannels).where(eq(studyPlannerSyncChannels.id, existing.id));

  const persist = async (channel: Awaited<ReturnType<GoogleWorkspaceApi["createWatchChannel"]>>) => {
    const values = {
      connectionId: connection.id,
      channelId: channel.channelId,
      resourceId: channel.resourceId || resourceId,
      resourceUri: channel.resourceUri,
      expirationAt: channel.expirationAt,
      channelTokenHash: channel.channelToken ? hashChannelToken(channel.channelToken) : null,
      lastMessageNumber: null as number | null,
      status: "active" as const,
      updatedAt: new Date(),
    };
    if (existing) {
      await db
        .update(studyPlannerSyncChannels)
        .set(values)
        .where(eq(studyPlannerSyncChannels.id, existing.id));
      return;
    }
    await db.insert(studyPlannerSyncChannels).values(values);
  };

  if (existing) {
    const result = await replaceWatchSafely(
      api,
      { channelId: existing.channelId, spreadsheetId: connection.spreadsheetId, resourceId: existing.resourceId || resourceId },
      persist,
    );
    return result.channel;
  }
  const channel = await api.createWatchChannel({ spreadsheetId: connection.spreadsheetId, resourceId });
  await persist(channel);
  return channel;
}

export type PlannerChannelRenewalResult = { connectionId: number; renewed: boolean; skipped?: string; error?: string };

/**
 * Mirrors renewGoogleWatchChannels but against study_planner_sync_channels.
 * Reuses the same threshold and locking strategy so the two cron batch modes
 * do not diverge: the same reconcile job can renew both sets in turn.
 */
export async function renewPlannerWatchChannels(
  apiFactory: GoogleWorkspaceApiFactory = createGoogleWorkspaceApi,
  options?: { thresholdHours?: number; maxRows?: number; actorUserId?: number; includeTokenless?: boolean },
): Promise<PlannerChannelRenewalResult[]> {
  const thresholdHours = options?.thresholdHours ?? WATCH_CHANNEL_RENEW_THRESHOLD_MS / (60 * 60 * 1000);
  const includeTokenless = options?.includeTokenless !== false;
  const rows = await db
    .select()
    .from(studyPlannerSyncChannels)
    // status is always "active" for live planner watches (no cascade soft-delete).
    .orderBy(studyPlannerSyncChannels.expirationAt)
    .limit(options?.maxRows ?? 500);
  const active = rows.filter((row) => (row as { status: string }).status === "active");
  const threshold = new Date(Date.now() + thresholdHours * 60 * 60 * 1000);
  const results: PlannerChannelRenewalResult[] = [];
  for (const channel of active) {
    let locked = false;
    try {
      await acquirePlannerSyncLock(channel.connectionId, "renew_planner_watch");
      locked = true;
      const currentRows = await db
        .select()
        .from(studyPlannerSyncChannels)
        .where(eq(studyPlannerSyncChannels.id, channel.id))
        .limit(1);
      const currentChannel = currentRows[0];
      if (!currentChannel || (currentChannel as { status: string }).status !== "active" || currentChannel.channelId !== channel.channelId) continue;
      const missingToken = !(currentChannel as { channelTokenHash: string | null }).channelTokenHash;
      if (!includeTokenless || !missingToken) {
        if (currentChannel.expirationAt && currentChannel.expirationAt > threshold) {
          results.push({ connectionId: channel.connectionId, renewed: false, skipped: "not_expiring_soon" });
          continue;
        }
      }
      const [connection] = await db.select().from(studyPlannerConnections).where(eq(studyPlannerConnections.id, channel.connectionId)).limit(1);
      if (!connection) { results.push({ connectionId: channel.connectionId, renewed: false, skipped: "missing_connection" }); continue; }
      if (!connection.enabled || connection.status === "disconnected") { results.push({ connectionId: channel.connectionId, renewed: false, skipped: "connection_disabled" }); continue; }
      const ownerUserId = connection.userId;
      if (!ownerUserId) { results.push({ connectionId: channel.connectionId, renewed: false, skipped: "missing_owner" }); continue; }
      const token = await loadGoogleToken(ownerUserId);
      if (!token?.refreshToken) { results.push({ connectionId: channel.connectionId, renewed: false, skipped: "oauth_revoked" }); continue; }
      try {
        const api = apiFactory(token as unknown as Parameters<GoogleWorkspaceApiFactory>[0]);
        const { channel: renewed } = await replaceWatchSafely(
          api,
          { channelId: channel.channelId, spreadsheetId: connection.spreadsheetId, resourceId: channel.resourceId },
          async (renewedChannel) => {
            await db
              .update(studyPlannerSyncChannels)
              .set({
                channelId: renewedChannel.channelId,
                resourceId: renewedChannel.resourceId || channel.resourceId,
                resourceUri: renewedChannel.resourceUri,
                expirationAt: renewedChannel.expirationAt,
                channelTokenHash: renewedChannel.channelToken ? hashChannelToken(renewedChannel.channelToken) : null,
                lastMessageNumber: null,
                status: "active",
                updatedAt: new Date(),
              })
              .where(eq(studyPlannerSyncChannels.id, channel.id));
          },
        );
        if (options?.actorUserId) {
          await writeAdminAudit({
            actorUserId: options.actorUserId,
            action: "study_planner.channel_renew",
            resourceType: "study_planner_connection",
            resourceId: connection.id,
            metadata: { channelId: renewed.channelId },
          });
        }
        results.push({ connectionId: channel.connectionId, renewed: true });
      } catch (error) {
        results.push({ connectionId: channel.connectionId, renewed: false, error: error instanceof Error ? error.message : "renew_failed" });
      }
    } catch (error) {
      results.push({ connectionId: channel.connectionId, renewed: false, error: error instanceof Error ? error.message : "renew_failed" });
    } finally {
      if (locked) await releasePlannerSyncLock(channel.connectionId);
    }
  }
  return results;
}

export async function renewPlannerWatchChannelIfExpiring(connectionId: number): Promise<void> {
  const rows = await db.select().from(studyPlannerSyncChannels).where(eq(studyPlannerSyncChannels.connectionId, connectionId)).limit(5);
  if (!rows.length) return;
  const threshold = new Date(Date.now() + WATCH_CHANNEL_RENEW_THRESHOLD_MS);
  const expiring = rows.filter((row) => (row as { status: string }).status === "active" && row.expirationAt && row.expirationAt <= threshold);
  if (!expiring.length) return;
  try {
    await renewPlannerWatchChannels(undefined, { maxRows: 1, actorUserId: undefined, thresholdHours: WATCH_CHANNEL_RENEW_THRESHOLD_MS / (60 * 60 * 1000) });
  } catch {
    // Renewal is always best-effort here; the cron retries.
  }
}

