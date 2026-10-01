import { eq } from "drizzle-orm";
import { db } from "@/db";
import { googleSheetConnections, googleSheetSyncChannels } from "@/db/schema";
import type { GoogleWorkspaceApi } from "@/lib/googleSheets/api";
import { loadGoogleToken } from "@/lib/googleSheets/auth";
import { createGoogleWorkspaceApi } from "@/lib/googleSheets/client";
import { writeAdminAudit } from "@/lib/adminAudit";
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
  const [existing] = await db.select().from(googleSheetSyncChannels).where(eq(googleSheetSyncChannels.connectionId, connection.id)).limit(1);
  const channel = existing
    ? await api.renewWatchChannel({ channelId: existing.channelId, spreadsheetId: connection.spreadsheetId, resourceId: existing.resourceId || resourceId })
    : await api.createWatchChannel({ spreadsheetId: connection.spreadsheetId, resourceId });
  const values = {
    connectionId: connection.id,
    channelId: channel.channelId,
    resourceId: channel.resourceId || resourceId,
    resourceUri: channel.resourceUri,
    expirationAt: channel.expirationAt,
    status: "active",
    updatedAt: new Date(),
  };
  if (existing) await db.update(googleSheetSyncChannels).set(values).where(eq(googleSheetSyncChannels.id, existing.id));
  else await db.insert(googleSheetSyncChannels).values(values);
  return channel;
}

export type ChannelRenewalResult = { connectionId: number; renewed: boolean; skipped?: string; error?: string };

/** Renew every channel whose expiration is inside the threshold window. */
export async function renewGoogleWatchChannels(
  apiFactory: GoogleWorkspaceApiFactory = createGoogleWorkspaceApi,
  options?: { thresholdHours?: number; maxRows?: number; actorUserId?: number },
): Promise<ChannelRenewalResult[]> {
  const thresholdHours = options?.thresholdHours ?? 6;
  const rows = await db.select().from(googleSheetSyncChannels).orderBy(googleSheetSyncChannels.expirationAt).limit(options?.maxRows ?? 500);
  const threshold = new Date(Date.now() + thresholdHours * 60 * 60 * 1000);
  const results: ChannelRenewalResult[] = [];
  for (const channel of rows) {
    if (channel.expirationAt && channel.expirationAt > threshold) { results.push({ connectionId: channel.connectionId, renewed: false, skipped: "not_expiring_soon" }); continue; }
    const [connection] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, channel.connectionId)).limit(1);
    if (!connection) { results.push({ connectionId: channel.connectionId, renewed: false, skipped: "missing_connection" }); continue; }
    if (!connection.enabled || connection.status === "disconnected") { results.push({ connectionId: channel.connectionId, renewed: false, skipped: "connection_disabled" }); continue; }
    const ownerUserId = connection.createdBy;
    if (!ownerUserId) { results.push({ connectionId: channel.connectionId, renewed: false, skipped: "missing_owner" }); continue; }
    const token = await loadGoogleToken(ownerUserId);
    if (!token?.refreshToken) { results.push({ connectionId: channel.connectionId, renewed: false, skipped: "oauth_revoked" }); continue; }
    try {
      const api = apiFactory(token);
      const renewed = await api.renewWatchChannel({ channelId: channel.channelId, spreadsheetId: connection.spreadsheetId, resourceId: channel.resourceId });
      await db.update(googleSheetSyncChannels).set({ channelId: renewed.channelId, resourceId: renewed.resourceId || channel.resourceId, resourceUri: renewed.resourceUri, expirationAt: renewed.expirationAt, status: "active", updatedAt: new Date() }).where(eq(googleSheetSyncChannels.id, channel.id));
      if (options?.actorUserId) await writeAdminAudit({ actorUserId: options.actorUserId, action: "google_sheet.channel_renew", resourceType: "google_sheet_connection", resourceId: connection.id, metadata: { channelId: renewed.channelId } });
      results.push({ connectionId: channel.connectionId, renewed: true });
    } catch (error) {
      results.push({ connectionId: channel.connectionId, renewed: false, error: error instanceof Error ? error.message : "renew_failed" });
    }
  }
  return results;
}
