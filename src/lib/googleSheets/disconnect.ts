import { eq } from "drizzle-orm";
import { db } from "@/db";
import { googleSheetConnections, googleSheetSyncChannels, googleSheetSyncPending } from "@/db/schema";
import { writeAdminAudit } from "@/lib/adminAudit";
import { loadGoogleToken } from "./auth";
import { createGoogleWorkspaceApi } from "./client";
import { acquireConnectionLock, releaseConnectionLock } from "./store";

export async function disconnectGoogleSheet(connectionId: number, actorUserId: number) {
  await acquireConnectionLock(connectionId, "disconnect");
  try {
    const [connection] = await db.select().from(googleSheetConnections)
      .where(eq(googleSheetConnections.id, connectionId)).limit(1);
    if (!connection) return { found: false, watchCleanupPending: false };
    const channels = await db.select().from(googleSheetSyncChannels)
      .where(eq(googleSheetSyncChannels.connectionId, connectionId));
    await db.transaction(async (tx) => {
      const status = ["archived", "replaced", "missing"].includes(connection.status) ? connection.status : "disconnected";
      await tx.update(googleSheetConnections).set({ enabled: false, status, updatedAt: new Date() })
        .where(eq(googleSheetConnections.id, connectionId));
      await tx.update(googleSheetSyncChannels).set({ status: "stopped", updatedAt: new Date() })
        .where(eq(googleSheetSyncChannels.connectionId, connectionId));
      await tx.update(googleSheetSyncPending).set({ pending: false, pendingAt: null, updatedAt: new Date() })
        .where(eq(googleSheetSyncPending.connectionId, connectionId));
      await writeAdminAudit({ actorUserId, action: "google_sheet.disconnect", resourceType: "google_sheet_connection", resourceId: connectionId, metadata: { setId: connection.setId, spreadsheetId: connection.spreadsheetId, vocabularyPreserved: true } }, tx);
    });
    let watchCleanupPending = false;
    if (channels.some((channel) => channel.resourceId)) {
      try {
        const token = connection.createdBy ? await loadGoogleToken(connection.createdBy) : null;
        if (!token?.refreshToken) watchCleanupPending = true;
        else {
          const api = createGoogleWorkspaceApi(token);
          for (const channel of channels) {
            if (!channel.resourceId) continue;
            try {
              if (!api.stopWatchChannel) watchCleanupPending = true;
              else await api.stopWatchChannel(channel.channelId, channel.resourceId);
            } catch { watchCleanupPending = true; }
          }
        }
      } catch { watchCleanupPending = true; }
    }
    return { found: true, watchCleanupPending };
  } finally {
    await releaseConnectionLock(connectionId);
  }
}
