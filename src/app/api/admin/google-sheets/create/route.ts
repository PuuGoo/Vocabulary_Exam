import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { requireAdminResourceAccess } from "@/lib/folderAuthorization";
import { db } from "@/db";
import { googleSheetConnections, vocabSets } from "@/db/schema";
import { createGoogleSheetForSet } from "@/lib/googleSheets/sheetLifecycle";
import { GoogleSheetsError } from "@/lib/googleSheets/errors";
import { isGoogleOAuthConfigured } from "@/lib/googleSheets/auth";
import { createSheetErrorOutcome, createSheetJson } from "@/lib/googleSheets/createFlow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({ setId: z.number().int().positive(), deleteBehavior: z.enum(["archive", "delete", "ignore"]).optional() });

export async function POST(req: NextRequest) {
  const access = await requireAdminPermission("google_sheets.manage");
  if (isAuthorizationError(access)) return access;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Thiếu setId hợp lệ.", code: "INVALID_SCHEMA" }, { status: 400 });
  const setId = parsed.data.setId;
  const [set] = await db.select().from(vocabSets).where(eq(vocabSets.id, setId)).limit(1);
  if (!set) return NextResponse.json({ error: "Không tìm thấy bộ từ vựng.", code: "NOT_FOUND" }, { status: 404 });
  const scoped = await requireAdminResourceAccess({ permission: "google_sheets.manage", folderId: set.folderId, level: "editor", access });
  if (isAuthorizationError(scoped)) return scoped;

  // A repeated create (double click, OAuth callback replay, browser retry) must
  // not spawn a second spreadsheet: reuse the existing connection.
  const [existing] = await db.select({ id: googleSheetConnections.id, spreadsheetId: googleSheetConnections.spreadsheetId, spreadsheetUrl: googleSheetConnections.spreadsheetUrl, sheetId: googleSheetConnections.sheetId, sheetTitle: googleSheetConnections.sheetTitle, status: googleSheetConnections.status }).from(googleSheetConnections).where(eq(googleSheetConnections.setId, setId)).limit(1);
  if (existing) {
    return NextResponse.json({ connectionId: existing.id, spreadsheetId: existing.spreadsheetId, spreadsheetUrl: existing.spreadsheetUrl, sheetId: existing.sheetId, sheetTitle: existing.sheetTitle, status: existing.status, alreadyConnected: true }, { status: 200 });
  }

  if (!isGoogleOAuthConfigured()) return createSheetJson({ status: 501, body: { error: "Google OAuth chưa được cấu hình trên máy chủ.", code: "NOT_CONFIGURED", retryable: false, setId } });
  try {
    const result = await createGoogleSheetForSet(setId, { userId: access.userId, displayName: access.displayName });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof GoogleSheetsError) {
      const outcome = createSheetErrorOutcome(error, setId);
      if (outcome.kind === "failed") console.error("[google-sheets] create failed", error.code, error.message);
      return createSheetJson(outcome);
    }
    console.error("[google-sheets] create failed", error instanceof Error ? error.message : "unknown");
    return createSheetJson(createSheetErrorOutcome(new GoogleSheetsError("Không thể tạo Google Sheet lúc này.", "UNKNOWN", { retryable: true }), setId));
  }
}
