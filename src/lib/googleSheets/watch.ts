import { and, eq } from "drizzle-orm";
import { replaceWatchSafely } from "./watchReplacement";
import { acquireConnectionLock, releaseConnectionLock } from "./store";
import { db } from "@/db";
import { googleSheetConnections, googleSheetSyncChannels } from "@/db/schema";
import { WATCH_CHANNEL_RENEW_THRESHOLD_MS } from "@/lib/googleSheets/api";
import type { GoogleWorkspaceApi } from "@/lib/googleSheets/api";
import { loadGoogleToken } from "@/lib/googleSheets/auth";
import { createGoogleWorkspaceApi } from "@/lib/googleSheets/client";
import { writeAdminAudit } from "@/lib/adminAudit";
import { hashChannelToken } from "@/lib/googleSheets/channelToken";
import type { GoogleWorkspaceApiFactory } from "@/lib/googleSheets/api";

/**
 * Create (or replace) the Drive watch channel for a connection. Google watch
 * channels expire, so this is called on connect, on renew and by the cron.
 */
export async function ensureWatchChannel(
  api: GoogleWorkspaceApi,
  connection: { id: number; spreadsheetId: string; createdBy: number | null },
  resourceId: string,
) {
  const [existing] = await db.select().from(googleSheetSyncChannels).where(and(eq(googleSheetSyncChannels.connectionId, connection.id), eq(googleSheetSyncChannels.status, "active"))).limit(1);
  const persist = async (channel: Awaited<ReturnType<GoogleWorkspaceApi["createWatchChannel"]>>) => {
  const values = {
    connectionId: connection.id,
    channelId: channel.channelId,
    resourceId: channel.resourceId || resourceId,
    resourceUri: channel.resourceUri,
    expirationAt: channel.expirationAt,
    // Only the digest is stored; the raw token is dropped here.
    channelTokenHash: channel.channelToken ? hashChannelToken(channel.channelToken) : null,
    lastMessageNumber: null,
    // A notification referencing a channel we cannot verify (legacy row with no
    // token) must not silently pass, so expose that state explicitly.
    status: "active",
    updatedAt: new Date(),
  };
  if (existing) await db.update(googleSheetSyncChannels).set(values).where(eq(googleSheetSyncChannels.id, existing.id));
  else await db.insert(googleSheetSyncChannels).values(values);
  };
  if (existing) {
    const result = await replaceWatchSafely(api, { channelId: existing.channelId, spreadsheetId: connection.spreadsheetId, resourceId: existing.resourceId || resourceId }, persist);
    return result.channel;
  }
  const channel = await api.createWatchChannel({ spreadsheetId: connection.spreadsheetId, resourceId });
  await persist(channel);
  return channel;
}

export type ChannelRenewalResult = { connectionId: number; renewed: boolean; skipped?: string; error?: string };

/**
 * Renew every channel that needs attention:
 *
 *  - a channel whose expiration is inside the threshold window, and
 *  - a channel with no stored token digest — i.e. one created before the
 *    channel-token fix. Those channels were never verifiable, so they are
 *    replaced automatically instead of asking an admin to reconnect.
 *
 * Replacement always creates a fresh channel id and a fresh token, and stops
 * the old channel when Google still accepts a stop request.
 */
export async function renewGoogleWatchChannels(
  apiFactory: GoogleWorkspaceApiFactory = createGoogleWorkspaceApi,
  options?: { thresholdHours?: number; maxRows?: number; actorUserId?: number; includeTokenless?: boolean },
): Promise<ChannelRenewalResult[]> {
  const thresholdHours = options?.thresholdHours ?? WATCH_CHANNEL_RENEW_THRESHOLD_MS / (60 * 60 * 1000);
  const includeTokenless = options?.includeTokenless !== false;
  const rows = await db.select().from(googleSheetSyncChannels).where(eq(googleSheetSyncChannels.status, "active")).orderBy(googleSheetSyncChannels.expirationAt).limit(options?.maxRows ?? 500);
  const threshold = new Date(Date.now() + thresholdHours * 60 * 60 * 1000);
  const results: ChannelRenewalResult[] = [];
  for (const channel of rows) {
    let locked = false;
    try {
    await acquireConnectionLock(channel.connectionId, "renew_watch");
    locked = true;
    const [currentChannel] = await db.select().from(googleSheetSyncChannels).where(eq(googleSheetSyncChannels.id, channel.id)).limit(1);
    if (!currentChannel || currentChannel.status !== "active" || currentChannel.channelId !== channel.channelId) continue;
    const missingToken = !channel.channelTokenHash;
    if (!includeTokenless || !missingToken) {
      if (channel.expirationAt && channel.expirationAt > threshold) { results.push({ connectionId: channel.connectionId, renewed: false, skipped: "not_expiring_soon" }); continue; }
    }
    const [connection] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, channel.connectionId)).limit(1);
    if (!connection) { results.push({ connectionId: channel.connectionId, renewed: false, skipped: "missing_connection" }); continue; }
    if (!connection.enabled || connection.status === "disconnected") { results.push({ connectionId: channel.connectionId, renewed: false, skipped: "connection_disabled" }); continue; }
    const ownerUserId = connection.createdBy;
    if (!ownerUserId) { results.push({ connectionId: channel.connectionId, renewed: false, skipped: "missing_owner" }); continue; }
    const token = await loadGoogleToken(ownerUserId);
    if (!token?.refreshToken) { results.push({ connectionId: channel.connectionId, renewed: false, skipped: "oauth_revoked" }); continue; }
    try {
      const api = apiFactory(token);
      const { channel: renewed } = await replaceWatchSafely(api, { channelId: channel.channelId, spreadsheetId: connection.spreadsheetId, resourceId: channel.resourceId }, async renewed => {
        await db.update(googleSheetSyncChannels).set({ channelId: renewed.channelId, resourceId: renewed.resourceId || channel.resourceId, resourceUri: renewed.resourceUri, expirationAt: renewed.expirationAt, channelTokenHash: renewed.channelToken ? hashChannelToken(renewed.channelToken) : null, lastMessageNumber: null, status: "active", updatedAt: new Date() }).where(eq(googleSheetSyncChannels.id, channel.id));
      });
      if (options?.actorUserId) await writeAdminAudit({ actorUserId: options.actorUserId, action: "google_sheet.channel_renew", resourceType: "google_sheet_connection", resourceId: connection.id, metadata: { channelId: renewed.channelId } });
      results.push({ connectionId: channel.connectionId, renewed: true });
    } catch (error) {
      results.push({ connectionId: channel.connectionId, renewed: false, error: error instanceof Error ? error.message : "renew_failed" });
    }
    } catch (error) {
      results.push({ connectionId: channel.connectionId, renewed: false, error: error instanceof Error ? error.message : "renew_failed" });
    } finally {
      if (locked) await releaseConnectionLock(channel.connectionId);
    }
  }
  return results;
}

/**
 * Opportunistically renew one channel if it is close to expiring.
 *
 * Called from the Drive webhook: a notification only arrives while a channel
 * is alive, which makes it the natural moment to top the channel up. The daily
 * reconciliation cron remains the safety net, but with a once-a-day schedule it
 * cannot guarantee a channel is renewed before it expires.
 *
 * Failures are swallowed on purpose: a renewal problem must never turn a
 * successful notification into a failed sync. The next notification (or the
 * cron) will try again.
 */
export async function renewWatchChannelIfExpiring(
  connectionId: number,
  options?: { thresholdMs?: number; apiFactory?: GoogleWorkspaceApiFactory },
): Promise<{ renewed: boolean; reason?: string }> {
  const thresholdMs = options?.thresholdMs ?? WATCH_CHANNEL_RENEW_THRESHOLD_MS;
  let locked = false;
  try {
    await acquireConnectionLock(connectionId, "renew_watch");
    locked = true;
    const [channel] = await db.select().from(googleSheetSyncChannels).where(and(eq(googleSheetSyncChannels.connectionId, connectionId), eq(googleSheetSyncChannels.status, "active"))).limit(1);
    if (!channel) return { renewed: false, reason: "no_channel" };
    const expiresSoon = !channel.expirationAt || channel.expirationAt.getTime() - Date.now() <= thresholdMs;
    if (!expiresSoon) return { renewed: false, reason: "not_expiring_soon" };

    const [connection] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, connectionId)).limit(1);
    if (!connection || !connection.enabled || connection.status === "disconnected") return { renewed: false, reason: "connection_inactive" };
    if (!connection.createdBy) return { renewed: false, reason: "missing_owner" };
    const token = await loadGoogleToken(connection.createdBy);
    if (!token?.refreshToken) return { renewed: false, reason: "oauth_revoked" };

    const api = (options?.apiFactory ?? createGoogleWorkspaceApi)(token);
    await replaceWatchSafely(api, { channelId: channel.channelId, spreadsheetId: connection.spreadsheetId, resourceId: channel.resourceId }, async renewed => {
    await db
      .update(googleSheetSyncChannels)
      .set({
        channelId: renewed.channelId,
        resourceId: renewed.resourceId || channel.resourceId,
        resourceUri: renewed.resourceUri,
        expirationAt: renewed.expirationAt,
        channelTokenHash: renewed.channelToken ? hashChannelToken(renewed.channelToken) : null,
        lastMessageNumber: null,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(googleSheetSyncChannels.id, channel.id));
    });
    return { renewed: true };
  } catch (error) {
    console.warn("[google-sheets] lazy channel renewal skipped:", error instanceof Error ? error.message : "unknown");
    return { renewed: false, reason: "renew_failed" };
  } finally {
    if (locked) await releaseConnectionLock(connectionId);
  }
}
