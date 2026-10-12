import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { google } from "googleapis";

import { getSession } from "@/lib/auth";
import { PLANNER_TEMPLATE_ID } from "@/lib/studyPlanner";
import { loadPlannerConnectionForUser } from "@/lib/studyPlanner/queries";
import { replaceStudyPlanner, snapshotPlanner } from "@/lib/studyPlanner/lifecycle";
import { extractPlannerTemplateId, getActivePlannerTemplateId } from "@/lib/studyPlanner/template";
import { getGoogleOAuthConfig, loadGoogleToken } from "@/lib/googleSheets/auth";
import { createGoogleWorkspaceApi } from "@/lib/googleSheets/client";
import { GoogleSheetsError } from "@/lib/googleSheets/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SPREADSHEET_ID_PATTERN = /^[a-zA-Z0-9-_]{20,}$/;

/**
 * Phase 12 — User-facing switch template (personal planner only).
 *
 * A student who was created from an older template can move to the template
 * the admin is currently publishing:
 *  1. a NEW personal copy is made from the resolved template (Drive copy),
 *  2. the copy is verified (tabs present, watch channel created),
 *  3. the connection flips to the new file in one transaction.
 *
 * Nothing is deleted: the previous file and every study_planner_* record stay
 * on disk, and a snapshot is written before the swap. The old file is only
 * trashed when the caller explicitly asks AND Lexora manages the file.
 * Vocabulary tables are never touched by this route.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const connection = await loadPlannerConnectionForUser(session.userId);
  // Idempotency: a user without a planner has nothing to switch. They use the
  // normal create flow, which already copies the active template.
  if (!connection) return NextResponse.json({ error: "Bạn chưa có Study Planner để đổi template." }, { status: 404 });

  const body = ((await req.json().catch(() => null)) ?? {}) as {
    templateUrlOrId?: unknown;
    templateId?: unknown;
    destinationSpreadsheetId?: unknown;
    trashPrevious?: unknown;
  };

  const requested = typeof body.templateUrlOrId === "string" ? body.templateUrlOrId
    : typeof body.templateId === "string" ? body.templateId
    : null;
  if (requested && !extractPlannerTemplateId(requested)) {
    return NextResponse.json({ error: "Link hoặc id Google Sheet không hợp lệ." }, { status: 400 });
  }
  const templateId = extractPlannerTemplateId(requested ?? "") ?? (await getActivePlannerTemplateId(PLANNER_TEMPLATE_ID));
  const directSwitch = typeof body.destinationSpreadsheetId === "string" ? body.destinationSpreadsheetId : "";
  if (directSwitch.trim()) {
    // Back-compat: the caller already copied a file and only needs the swap.
    // Treat it as a bare id (full urls also accepted) so stale confirmations
    // still go through with the new destinationId plumbing.
    const bare = extractPlannerTemplateId(directSwitch);
    if (!bare) return NextResponse.json({ error: "Link hoặc id Google Sheet không hợp lệ." }, { status: 400 });
    try {
      const result = await replaceStudyPlanner(
        { userId: session.userId },
        { confirmedSpreadsheetId: connection.spreadsheetId, destinationSpreadsheetId: bare, trashPrevious: body.trashPrevious === true },
      );
      return NextResponse.json(result);
    } catch (error) {
      const code = error instanceof GoogleSheetsError ? error.code : "UNKNOWN";
      return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể đổi template.", code }, { status: error instanceof GoogleSheetsError && error.status ? error.status : 400 });
    }
  }

  // Fresh template → personal copy via Drive (same appProperties scheme as the
  // original copy, keyed by the HMAC so the Drive list guard remains true).
  if (!SPREADSHEET_ID_PATTERN.test(templateId)) {
    return NextResponse.json({ error: "Link hoặc id Google Sheet không hợp lệ." }, { status: 400 });
  }

  const token = await loadGoogleToken(session.userId);
  if (!token?.refreshToken) {
    return NextResponse.json({ error: "Bạn cần kết nối tài khoản Google trước.", code: "OAUTH_REQUIRED" }, { status: 401 });
  }
  if (!token.scope.split(/\s+/).includes("https://www.googleapis.com/auth/drive.readonly")) {
    return NextResponse.json({ error: "Kết nối Google để cấp quyền đọc Sheet mẫu.", code: "OAUTH_REQUIRED" }, { status: 401 });
  }
  const config = getGoogleOAuthConfig();
  const auth = new google.auth.OAuth2(config.clientId, config.clientSecret, config.redirectUri);
  auth.setCredentials({ access_token: token.accessToken, refresh_token: token.refreshToken, expiry_date: token.expiresAt.getTime() });
  const drive = google.drive({ version: "v3", auth });
  const secret = process.env.GOOGLE_SHEET_TOKEN_ENCRYPTION_KEY;
  if (!secret) return NextResponse.json({ error: "Planner identity not configured." }, { status: 500 });
  const lexoraKey = createHmac("sha256", secret).update(`study-planner:${session.userId}`).digest("hex");

  let copiedId: string | null = null;
  try {
    const result = await drive.files.copy(
      { fileId: templateId, fields: "id", requestBody: { name: `Study Planner - ${session.displayName ?? session.username}`, appProperties: { lexoraPlanner: lexoraKey } } },
      { retry: false } as unknown as Record<string, unknown>,
    );
    if (!result.data.id) throw new Error("Google did not return a copied file id");
    copiedId = result.data.id;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không tạo được bản copy mới từ template.", code: error instanceof GoogleSheetsError ? error.code : "UNKNOWN" }, { status: error instanceof GoogleSheetsError && error.status ? error.status : 502 });
  }

  try {
    // Snapshot the old planner and then run the staged replace: metadata check,
    // new channel, transaction, and only then dropping the old watch. Vocabulary
    // is never touched: only study_planner_* rows move.
    await snapshotPlanner(connection.id, "switch_template_before").catch(() => undefined);
    const ownedApi = createGoogleWorkspaceApi(token as Parameters<typeof createGoogleWorkspaceApi>[0]);
    const result = await replaceStudyPlanner(
      { userId: session.userId },
      { confirmedSpreadsheetId: connection.spreadsheetId, destinationSpreadsheetId: copiedId, templateId, trashPrevious: body.trashPrevious === true, api: ownedApi },
    );
    return NextResponse.json({ ...result, templateId, copiedId });
  } catch (error) {
    // Activation is the single commit point: the copied file is left alone so
    // the user can retry without side effects; the old connection stays linked.
    const code = error instanceof GoogleSheetsError ? error.code : "UNKNOWN";
    return NextResponse.json({ error: error instanceof Error ? error.message : "Đổi template thất bại.", code }, { status: error instanceof GoogleSheetsError && error.status ? error.status : 400 });
  }
}