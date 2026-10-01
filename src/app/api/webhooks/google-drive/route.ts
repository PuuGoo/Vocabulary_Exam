import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { googleSheetConnections, googleSheetSyncChannels } from "@/db/schema";
import { markSyncPending, recordNotificationState } from "@/lib/googleSheets/store";
import { runPendingConnection } from "@/lib/googleSheets/reconcile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The sync runs inside this request so Vercel cannot discard the function as
// soon as the response is sent (fire-and-forget after returning is not reliable
// on serverless, and this project is on Next 14 which has no waitUntil()).
export const maxDuration = 60;

function isValidWebhookToken(request: NextRequest, body: string): boolean {
  const secret = process.env.GOOGLE_WEBHOOK_TOKEN_SECRET;
  const provided = request.headers.get("x-goog-channel-token") || "";
  if (!secret || !provided) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Google Drive push notification.
 *
 * The notification is only an event signal — it carries no row/cell delta, so we
 * validate the channel and read the spreadsheet again. The sync runs here, which
 * makes the feature near-real-time without a high-frequency cron (Vercel Hobby
 * rejects cron schedules that run more than once per day); the daily reconcile
 * cron stays as a safety net for webhooks that never arrived or failed.
 *
 * Duplicate and out-of-order notifications are filtered by
 * recordNotificationState (channel id + resource id + monotonic message number),
 * so a Google retry can never produce a second effective sync. Every run also
 * fingerprints against the database, so re-syncing unchanged rows is a no-op.
 */
export async function POST(req: NextRequest) {
  const body = await req.text().catch(() => "");
  const channelId = req.headers.get("x-goog-channel-id") || "";
  const resourceId = req.headers.get("x-goog-resource-id") || "";
  const messageNumber = Number(req.headers.get("x-goog-message-number") || "0");
  if (!channelId || !resourceId) return NextResponse.json({ error: "Missing notification headers." }, { status: 400 });
  if (!isValidWebhookToken(req, body)) return NextResponse.json({ error: "Invalid channel token." }, { status: 403 });

  const [channel] = await db.select().from(googleSheetSyncChannels).where(eq(googleSheetSyncChannels.channelId, channelId)).limit(1);
  if (!channel) return NextResponse.json({ ok: true, ignored: "unknown_channel" }, { status: 202 });
  const state = await recordNotificationState(channelId, resourceId, messageNumber);
  if (!state) return NextResponse.json({ ok: true, ignored: "duplicate_or_out_of_order" }, { status: 202 });

  const [connection] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, channel.connectionId)).limit(1);
  if (!connection || !connection.enabled || connection.status === "disconnected") {
    return NextResponse.json({ ok: true, ignored: "connection_inactive" }, { status: 202 });
  }

  // Persist first: if this invocation dies mid-sync (timeout, cold start, revoked
  // OAuth) the connection is still pending and the daily cron picks it up.
  await markSyncPending(connection.id, "webhook");
  const result = await runPendingConnection(connection.id, "webhook");
  if (result.status === "error") console.error(`[google-drive-webhook] connection ${connection.id} sync failed: ${result.error ?? "unknown"}`);
  return NextResponse.json({ ok: true, connectionId: connection.id, sync: result.status, ...(result.error ? { error: result.error } : {}) }, { status: 202 });
}