import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { googleSheetConnections, googleSheetSyncChannels } from "@/db/schema";
import { recordNotificationState } from "@/lib/googleSheets/store";
import { runPendingConnection } from "@/lib/googleSheets/reconcile";
import { verifyChannelToken } from "@/lib/googleSheets/channelToken";
import { renewWatchChannelIfExpiring } from "@/lib/googleSheets/watch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The sync runs inside this request so Vercel cannot discard the function as
// soon as the response is sent (fire-and-forget after returning is not reliable
// on serverless, and this project is on Next 14 which has no waitUntil()).
export const maxDuration = 60;

/**
 * Google Drive push notification.
 *
 * Authentication follows the Drive Push Notification contract exactly:
 * the `token` we set when creating the watch channel comes back as the
 * `X-Goog-Channel-Token` header. The notification body is empty for
 * files.watch, so nothing is parsed from it and nothing is HMAC-computed from
 * it — that older scheme could never validate a real Google notification.
 *
 * The notification is only an event signal: we acknowledge it, then read the
 * spreadsheet again and diff it against PostgreSQL.
 *
 * Resource states:
 *  - `sync`     → the channel just came online; confirm it works, no vocabulary
 *                 diff is required.
 *  - `update`   → content changed; the X-Goog-Changed header tells us whether
 *                 it was `content` or `properties`.
 *  - anything else (add / remove / trash / untrash / future states) is handled
 *    gracefully and still syncs, because a row may have appeared or vanished.
 */
export async function POST(req: NextRequest) {
  const channelId = req.headers.get("x-goog-channel-id") || "";
  const resourceId = req.headers.get("x-goog-resource-id") || "";
  const channelToken = req.headers.get("x-goog-channel-token") || "";
  const rawMessageNumber = req.headers.get("x-goog-message-number") || "";
  const resourceState = (req.headers.get("x-goog-resource-state") || "").toLowerCase();
  const changed = (req.headers.get("x-goog-changed") || "").toLowerCase();

  if (!channelId || !resourceId) {
    return NextResponse.json({ error: "Missing notification headers." }, { status: 400 });
  }

  const [channel] = await db.select().from(googleSheetSyncChannels).where(eq(googleSheetSyncChannels.channelId, channelId)).limit(1);
  if (!channel) return NextResponse.json({ ok: true, ignored: "unknown_channel" }, { status: 202 });
  if (channel.status !== "active") return NextResponse.json({ ok: true, ignored: "inactive_channel" }, { status: 202 });

  // The token must match the digest stored when the channel was created.
  // Legacy rows (created before this fix) have no digest and can never pass,
  // so they are rejected here and recreated by the renewal cron.
  if (!verifyChannelToken(channelToken, channel.channelTokenHash)) {
    console.warn(`[google-drive-webhook] rejected notification: channel ${channelId} failed token verification`);
    return NextResponse.json({ error: "Invalid channel token." }, { status: 403 });
  }
  if (channel.resourceId && channel.resourceId !== resourceId) {
    return NextResponse.json({ ok: true, ignored: "resource_mismatch" }, { status: 202 });
  }

  const messageNumber = Number(rawMessageNumber || "0");
  const hasMessageNumber = /^\d+$/.test(rawMessageNumber) && Number.isSafeInteger(messageNumber) && messageNumber > 0;
  if (!hasMessageNumber) return NextResponse.json({ error: "Invalid message number." }, { status: 400 });
  // Idempotency: Google message numbers start at 1 and only increase — they
  // are not necessarily sequential, so only reject <= lastMessageNumber.
  if (hasMessageNumber && channel.lastMessageNumber != null && messageNumber <= channel.lastMessageNumber) {
    return NextResponse.json({ ok: true, ignored: "duplicate_or_out_of_order" }, { status: 202 });
  }

  console.log(
    `[google-drive-webhook] channelId=${channelId} resourceId=${resourceId} state=${resourceState || "unknown"} changed=${changed || "unknown"} messageNumber=${hasMessageNumber ? messageNumber : "none"} connectionId=${channel.connectionId}`
  );

  // Lazy renewal: a notification proves the channel is alive, so this is the
  // cheapest moment to top it up. The daily cron is the safety net, but with a
  // once-a-day schedule (Vercel Hobby) it cannot be the only renewal path —
  // otherwise a channel could expire in the gap between two cron runs.
  // A `sync` notification only confirms the channel is alive: record it, then
  // stop. Google sends it when a watch starts, before any content change.
  if (resourceState === "sync") {
    await recordNotificationState(channelId, resourceId, hasMessageNumber ? messageNumber : (channel.lastMessageNumber ?? 1));
    return NextResponse.json({ ok: true, connectionId: channel.connectionId, resourceState: "sync", acknowledged: true }, { status: 202 });
  }

  const state = await recordNotificationState(channelId, resourceId, messageNumber, "webhook");
  if (!state) return NextResponse.json({ ok: true, ignored: "duplicate_or_out_of_order" }, { status: 202 });

  const [connection] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, channel.connectionId)).limit(1);
  if (!connection || !connection.enabled || connection.status === "disconnected") {
    return NextResponse.json({ ok: true, ignored: "connection_inactive" }, { status: 202 });
  }


  // Persist first: if this invocation dies mid-sync (timeout, cold start, revoked
  // OAuth) the connection is still pending and the daily cron picks it up.
  const result = await runPendingConnection(connection.id, "webhook");
  await renewWatchChannelIfExpiring(channel.connectionId);
  // Safe diagnostics only: ids/status. No token, no OAuth material, no body.
  console.log(`[google-drive-webhook] connectionId=${connection.id} trigger=webhook resourceState=${resourceState || "unknown"} changed=${changed || "none"} messageNumber=${hasMessageNumber ? messageNumber : "none"} sync=${result.status}`);
  if (result.status === "error") console.error(`[google-drive-webhook] connection ${connection.id} sync failed: ${result.error ?? "unknown"}`);
  return NextResponse.json({
    ok: true,
    connectionId: connection.id,
    resourceState: resourceState || "unknown",
    changed: changed || null,
    sync: result.status,
    ...(result.error ? { error: result.error } : {}),
  }, { status: 202 });
}
