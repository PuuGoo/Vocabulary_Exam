import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { loadPlannerConnectionForUser, loadPlannerConnectionStatus } from "@/lib/studyPlanner/queries";
import { classifyPlannerSpreadsheetHealth, disconnectStudyPlanner, replaceStudyPlanner } from "@/lib/studyPlanner/lifecycle";
import { createGoogleWorkspaceApi } from "@/lib/googleSheets/client";
import { loadGoogleToken } from "@/lib/googleSheets/auth";
import { GoogleSheetsError } from "@/lib/googleSheets/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Phase 11 — Planner recovery panel endpoints (own planner only).
 *
 * GET: connection status + spreadsheet health (missing, revoked, denied).
 * POST { action: "disconnect" | "replace", confirmedSpreadsheetId?, trashPrevious? }.
 * Ownership is the session's own planner; nothing here can touch vocabulary.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const connection = await loadPlannerConnectionForUser(session.userId);
  if (!connection) return NextResponse.json({ connected: false });
  const status = await loadPlannerConnectionStatus(connection.id);
  const token = await loadGoogleToken(session.userId);
  let health = null;
  if (token?.refreshToken) {
    try {
      const api = createGoogleWorkspaceApi(token as Parameters<typeof createGoogleWorkspaceApi>[0]);
      health = await classifyPlannerSpreadsheetHealth(connection.id, api);
    } catch (error) {
      health = { missing: false, accessDenied: false, accessible: false, message: error instanceof Error ? error.message : "Không thể kiểm tra spreadsheet." };
    }
  } else {
    health = { missing: false, accessDenied: true, accessible: false, message: "Hãy kết nối Google của bạn.", oauthRevoked: true };
  }
  return NextResponse.json({ connected: true, connection: status?.connection ?? connection, channel: status?.channel ?? null, health });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { action?: string; confirmedSpreadsheetId?: unknown; trashPrevious?: unknown } | null;
  if (!body?.action) return NextResponse.json({ error: "Thiếu action." }, { status: 400 });
  try {
    if (body.action === "disconnect") {
      const result = await disconnectStudyPlanner({ userId: session.userId });
      return NextResponse.json(result);
    }
    if (body.action === "replace") {
      if (typeof body.confirmedSpreadsheetId !== "string" || !body.confirmedSpreadsheetId) {
        return NextResponse.json({ error: "Thiếu spreadsheet id đã xác nhận." }, { status: 400 });
      }
      const result = await replaceStudyPlanner(
        { userId: session.userId },
        { confirmedSpreadsheetId: body.confirmedSpreadsheetId, trashPrevious: body.trashPrevious === true },
      );
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: "Action không hợp lệ." }, { status: 400 });
  } catch (error) {
    const code = error instanceof GoogleSheetsError ? error.code : "UNKNOWN";
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Khôi phục thất bại.", code },
      { status: error instanceof GoogleSheetsError && error.status ? error.status : 400 },
    );
  }
}
