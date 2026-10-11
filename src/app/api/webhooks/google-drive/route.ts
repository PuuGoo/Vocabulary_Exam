import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { googleSheetConnections, googleSheetSyncChannels, studyPlannerConnections, studyPlannerSyncChannels } from "@/db/schema";
import { recordNotificationState } from "@/lib/googleSheets/store";
import { recordPlannerNotificationState } from "@/lib/studyPlanner/store";
import { runPendingPlannerConnection } from "@/lib/studyPlanner/reconcile";
import { runPendingConnection } from "@/lib/googleSheets/reconcile";
import { verifyChannelToken } from "@/lib/googleSheets/channelToken";
import { renewPlannerWatchChannelIfExpiring } from "@/lib/studyPlanner/watch";
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

  // A planner notification is valid even when vocabulary has no matching
  // channel; the two namespaces are queried explicitly so a valid planner
  // signal is never logged as "unknown_channel".
  const [vocabChannel] = await db.select().from(googleSheetSyncChannels).where(eq(googleSheetSyncChannels.channelId, channelId)).limit(1);
  const plannerChannelRows = await db
    .select()
    .from(studyPlannerSyncChannels)
    .where(eq(studyPlannerSyncChannels.channelId, channelId))
    .limit(1);
  const plannerChannel = plannerChannelRows[0] as ({ id: number; connectionId: number; channelId: string; resourceId: string | null; resourceUri?: string | null; expirationAt: Date | null; channelTokenHash: string | null; lastMessageNumber: number | null; status: string } | undefined);
  const namespace: "vocab" | "planner" | "none" = plannerChannel ? "planner" : vocabChannel ? "vocab" : "none";
  if (namespace === "none") return NextResponse.json({ ok: true, ignored: "unknown_channel" }, { status: 202 });
  const channel: { channelId: string; resourceId: string | null; channelTokenHash: string | null; lastMessageNumber: number | null; status: string; connectionId: number } =
    namespace === "planner"
      ? {
          channelId: plannerChannel!.channelId,
          resourceId: plannerChannel!.resourceId,
          channelTokenHash: plannerChannel!.channelTokenHash,
          lastMessageNumber: plannerChannel!.lastMessageNumber,
          status: plannerChannel!.status,
          connectionId: plannerChannel!.connectionId,
        }
      : {
          channelId: vocabChannel!.channelId,
          resourceId: vocabChannel!.resourceId,
          channelTokenHash: vocabChannel!.channelTokenHash,
          lastMessageNumber: vocabChannel!.lastMessageNumber,
          status: vocabChannel!.status,
          connectionId: vocabChannel!.connectionId,
        };
  if (channel.status !== "active") return NextResponse.json({ ok: true, ignored: "inactive_channel" }, { status: 202 });

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
  if (hasMessageNumber && channel.lastMessageNumber != null && messageNumber <= channel.lastMessageNumber) {
    return NextResponse.json({ ok: true, ignored: "duplicate_or_out_of_order" }, { status: 202 });
  }

  console.log(
    `[google-drive-webhook] channelId=${channelId} namespace=${namespace} resourceId=${resourceId} state=${resourceState || "unknown"} changed=${changed || "unknown"} messageNumber=${hasMessageNumber ? messageNumber : "none"} connectionId=${channel.connectionId}`
  );

  if (resourceState === "sync") {
    if (namespace === "planner") {
      await recordPlannerNotificationState(channelId, resourceId, hasMessageNumber ? messageNumber : (channel.lastMessageNumber ?? 1));
    } else {
      await recordNotificationState(channelId, resourceId, hasMessageNumber ? messageNumber : (channel.lastMessageNumber ?? 1));
    }
    return NextResponse.json({ ok: true, namespace, connectionId: channel.connectionId, resourceState: "sync", acknowledged: true }, { status: 202 });
  }

  if (namespace === "planner") {
    const state = await recordPlannerNotificationState(channelId, resourceId, messageNumber, "webhook");
    if (!state) return NextResponse.json({ ok: true, ignored: "duplicate_or_out_of_order" }, { status: 202 });
    const [plannerConnection] = await db
      .select()
      .from(studyPlannerConnections)
      .where(eq(studyPlannerConnections.id, channel.connectionId))
      .limit(1);
    if (!plannerConnection || !plannerConnection.enabled || plannerConnection.status === "disconnected") {
      return NextResponse.json({ ok: true, ignored: "connection_inactive", namespace }, { status: 202 });
    }
    let plannerResult = await runPendingPlannerConnection(plannerConnection.id, "webhook");
    const plannerDeadline = Date.now() + 15000;
    while (plannerResult.status === "locked" && Date.now() < plannerDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      plannerResult = await runPendingPlannerConnection(plannerConnection.id, "webhook");
    }
    await renewPlannerWatchChannelIfExpiring(plannerConnection.id);
    console.log(
      `[google-drive-webhook] namespace=planner connectionId=${plannerConnection.id} resourceState=${resourceState || "unknown"} changed=${changed || "none"} messageNumber=${hasMessageNumber ? messageNumber : "none"} sync=${plannerResult.status}`
    );
    if (plannerResult.status === "error") {
      console.error(`[google-drive-webhook] planner connection ${plannerConnection.id} sync failed: ${plannerResult.error ?? "unknown"}`);
    }
    return NextResponse.json({
      ok: true,
      namespace: "planner",
      connectionId: plannerConnection.id,
      resourceState: resourceState || "unknown",
      changed: changed || null,
      sync: plannerResult.status,
      ...(plannerResult.error ? { error: plannerResult.error } : {}),
    }, { status: 202 });
  }

  const state = await recordNotificationState(channelId, resourceId, messageNumber, "webhook");
  if (!state) return NextResponse.json({ ok: true, ignored: "duplicate_or_out_of_order" }, { status: 202 });
  const [connection] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, channel.connectionId)).limit(1);
  if (!connection || !connection.enabled || connection.status === "disconnected") {
    return NextResponse.json({ ok: true, ignored: "connection_inactive" }, { status: 202 });
  }
  let result = await runPendingConnection(connection.id, "webhook");
  const lockDeadline = Date.now() + 15000;
  while (result.status === "locked" && Date.now() < lockDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    result = await runPendingConnection(connection.id, "webhook");
  }
  await renewWatchChannelIfExpiring(channel.connectionId);
  console.log(
    `[google-drive-webhook] namespace=vocab connectionId=${connection.id} trigger=webhook resourceState=${resourceState || "unknown"} changed=${changed || "none"} messageNumber=${hasMessageNumber ? messageNumber : "none"} sync=${result.status}`
  );
  if (result.status === "error") console.error(`[google-drive-webhook] connection ${connection.id} sync failed: ${result.error ?? "unknown"}`);
  return NextResponse.json({
    ok: true,
    namespace: "vocab",
    connectionId: connection.id,
    resourceState: resourceState || "unknown",
    changed: changed || null,
    sync: result.status,
    ...(result.error ? { error: result.error } : {}),
  }, { status: 202 });
}
