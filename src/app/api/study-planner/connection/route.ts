import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { loadPlannerConnectionStatus } from "@/lib/studyPlanner/queries";
import { loadPlannerConnectionForUser } from "@/lib/studyPlanner/queries";

/**
 * Phase 10 — Own planner connection status.
 *
 * Ownership is derived from the session: the API serves only the caller's
 * planner (study_planner_connections.user_id = session.userId). A client-
 * supplied user id is never trusted, so one student can never read another
 * student's spreadsheet link, channel or error state.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const connection = await loadPlannerConnectionForUser(session.userId);
  if (!connection) return NextResponse.json({ connected: false });
  const status = await loadPlannerConnectionStatus(connection.id);
  if (!status) return NextResponse.json({ connected: false });
  return NextResponse.json({
    connected: true,
    status: status.connection.status,
    enabled: status.connection.enabled,
    spreadsheetId: status.connection.spreadsheetId,
    spreadsheetUrl: status.connection.spreadsheetUrl,
    spreadsheetName: status.connection.spreadsheetName,
    lastSyncedAt: status.connection.lastSyncedAt,
    lastSuccessfulSyncedAt: status.connection.lastSuccessfulSyncedAt,
    lastError: status.connection.lastError,
    channel: status.channel ? { expirationAt: status.channel.expirationAt, lastNotifiedAt: status.channel.lastNotifiedAt, status: status.channel.status } : null,
    pending: status.pending,
    revision: status.revision,
  });
}
