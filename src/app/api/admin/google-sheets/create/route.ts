import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { requireAdminResourceAccess } from "@/lib/folderAuthorization";
import { db } from "@/db";
import { vocabSets } from "@/db/schema";
import { createGoogleSheetForSet } from "@/lib/googleSheets/sheetLifecycle";
import { GoogleSheetsError } from "@/lib/googleSheets/errors";
import { isGoogleOAuthConfigured } from "@/lib/googleSheets/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({ setId: z.number().int().positive(), deleteBehavior: z.enum(["archive", "delete", "ignore"]).optional() });

export async function POST(req: NextRequest) {
  const access = await requireAdminPermission("google_sheets.manage");
  if (isAuthorizationError(access)) return access;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Thiếu setId hợp lệ." }, { status: 400 });
  const setId = parsed.data.setId;
  const [set] = await db.select().from(vocabSets).where(eq(vocabSets.id, setId)).limit(1);
  if (!set) return NextResponse.json({ error: "Không tìm thấy bộ từ vựng." }, { status: 404 });
  const scoped = await requireAdminResourceAccess({ permission: "google_sheets.manage", folderId: set.folderId, level: "editor", access });
  if (isAuthorizationError(scoped)) return scoped;
  if (!isGoogleOAuthConfigured()) return NextResponse.json({ error: "Google OAuth chưa được cấu hình.", code: "NOT_CONFIGURED" }, { status: 501 });
  try {
    const result = await createGoogleSheetForSet(setId, { userId: access.userId, displayName: access.displayName });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof GoogleSheetsError) {
      const status = error.code === "OAUTH_REQUIRED" ? 401 : error.code === "INVALID_SCHEMA" ? 409 : 502;
      return NextResponse.json({ error: error.message, code: error.code, retryable: error.retryable }, { status });
    }
    console.error("[google-sheets] create failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Không thể tạo Google Sheet.", code: "UNKNOWN", retryable: true }, { status: 502 });
  }
}
