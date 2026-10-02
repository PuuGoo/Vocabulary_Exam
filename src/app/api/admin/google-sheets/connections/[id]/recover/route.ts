import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { requireAdminResourceAccess } from "@/lib/folderAuthorization";
import { db } from "@/db";
import { googleSheetConnections, vocabSets } from "@/db/schema";
import { recoverGoogleSheetConnection } from "@/lib/googleSheets/recovery";
import { GoogleSheetsError } from "@/lib/googleSheets/errors";
import { isGoogleOAuthConfigured } from "@/lib/googleSheets/auth";
import { createSheetErrorOutcome, createSheetJson } from "@/lib/googleSheets/createFlow";
import { checkRateLimit, recordRateLimitHit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RATE_LIMIT = { windowMs: 60 * 1000, maxAttempts: 6 };

/**
 * Explicit recovery endpoint for a broken Google Sheets connection.
 *
 * Used by the admin panel's [Khôi phục kết nối] button. It never creates a
 * spreadsheet: it verifies access to the existing one, repairs row mappings and
 * the Drive watch channel, re-enables the connection and syncs once. Only
 * POST /create may ever create a new spreadsheet, and only when the old one is
 * verifiably gone.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireAdminPermission("google_sheets.manage");
  if (isAuthorizationError(access)) return access;
  const connectionId = Number(params.id);
  if (!Number.isInteger(connectionId) || connectionId < 1) return NextResponse.json({ error: "Không tìm thấy kết nối." }, { status: 404 });

  const limitKey = `google-sheet-recover:${access.userId}`;
  const limit = checkRateLimit(limitKey, RATE_LIMIT);
  if (limit.limited) return NextResponse.json({ error: "Quá nhiều yêu cầu khôi phục, thử lại sau ít phút.", retryAfterSeconds: limit.retryAfterSeconds }, { status: 429 });
  recordRateLimitHit(limitKey, RATE_LIMIT);

  const [connection] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, connectionId)).limit(1);
  if (!connection) return NextResponse.json({ error: "Không tìm thấy kết nối." }, { status: 404 });
  const [set] = await db.select().from(vocabSets).where(eq(vocabSets.id, connection.setId)).limit(1);
  const scoped = await requireAdminResourceAccess({ permission: "google_sheets.manage", folderId: set?.folderId ?? null, level: "editor", access });
  if (isAuthorizationError(scoped)) return scoped;

  if (!isGoogleOAuthConfigured()) return createSheetJson({ status: 501, body: { error: "Google OAuth chưa được cấu hình trên máy chủ.", code: "NOT_CONFIGURED", retryable: false } });

  try {
    const result = await recoverGoogleSheetConnection(connectionId, { userId: access.userId });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof GoogleSheetsError) {
      if (error.code === "OAUTH_REQUIRED" || error.code === "OAUTH_REVOKED") {
        // Same structured onboarding payload the create flow uses, so the panel
        // can send the admin into the existing OAuth flow without a 401.
        return createSheetJson({ status: 202, body: { error: "Kết nối Google để khôi phục Google Sheet.", code: error.code, oauthRequired: true, setId: connection.setId } });
      }
      if (error.code === "SHEET_NOT_FOUND") {
        return NextResponse.json({ error: "Không thể truy cập Google Sheet cũ. Bạn có thể tạo Sheet mới.", code: error.code, spreadsheetGone: true, retryable: false }, { status: 404 });
      }
      const status = error.code === "RATE_LIMITED" || error.code === "TIMEOUT" || error.code === "NETWORK" ? 503 : 502;
      return NextResponse.json({ error: "Khôi phục Google Sheet thất bại. Vui lòng thử lại.", code: error.code, retryable: error.retryable }, { status });
    }
    console.error("[google-sheets] recover failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Khôi phục Google Sheet thất bại. Vui lòng thử lại.", code: "UNKNOWN", retryable: true }, { status: 502 });
  }
}