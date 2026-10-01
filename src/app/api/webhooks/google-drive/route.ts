import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { googleSheetConnections, googleSheetSyncChannels } from "@/db/schema";
import { markSyncPending, recordNotificationState } from "@/lib/googleSheets/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
 * Google Drive push notifications are only an event signal. We validate the
 * channel, mark the connection as pending and return immediately; the actual
 * sync runs in the request below or via the reconcile cron.
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
  if (!connection || !connection.enabled || connection.status === "disconnected") return NextResponse.json({ ok: true, ignored: "connection_inactive" }, { status: 202 });
  await markSyncPending(connection.id, "webhook");
  return NextResponse.json({ ok: true, connectionId: connection.id, pending: true }, { status: 202 });
}
