import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { requireAdminResourceAccess } from "@/lib/folderAuthorization";
import { db } from "@/db";
import { googleSheetConnections, vocabSets } from "@/db/schema";
import { syncConnection } from "@/lib/googleSheets/sheetLifecycle";
import { GoogleSheetsError } from "@/lib/googleSheets/errors";
import { checkRateLimit, recordRateLimitHit } from "@/lib/rateLimit";
import { syncRequestSchema, syncIsPartial } from "@/lib/googleSheets/reliability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RATE_LIMIT = { windowMs: 60 * 1000, maxAttempts: 6 };

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireAdminPermission("google_sheets.sync");
  if (isAuthorizationError(access)) return access;
  const body = await _req.text();
  let input: unknown = {};
  try { input = body ? JSON.parse(body) : {}; } catch { return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 }); }
  const parsed = syncRequestSchema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  if (parsed.data.repairWatch || parsed.data.resolutions?.length) {
    const manage = await requireAdminPermission("google_sheets.manage");
    if (isAuthorizationError(manage)) return manage;
  }
  const connectionId = Number(params.id);
  if (!Number.isInteger(connectionId) || connectionId < 1) return NextResponse.json({ error: "Không tìm thấy kết nối." }, { status: 404 });
  const limitKey = `google-sheet-sync:${access.userId}`;
  const limit = checkRateLimit(limitKey, RATE_LIMIT);
  if (limit.limited) return NextResponse.json({ error: "Quá nhiều yêu cầu đồng bộ, thử lại sau ít phút.", retryAfterSeconds: limit.retryAfterSeconds }, { status: 429 });
  recordRateLimitHit(limitKey, RATE_LIMIT);

  const [connection] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, connectionId)).limit(1);
  if (!connection) return NextResponse.json({ error: "Không tìm thấy kết nối." }, { status: 404 });
  const [set] = await db.select().from(vocabSets).where(eq(vocabSets.id, connection.setId)).limit(1);
  const scoped = await requireAdminResourceAccess({ permission: "google_sheets.sync", folderId: set?.folderId ?? null, level: "editor", access });
  if (isAuthorizationError(scoped)) return scoped;
  if (!connection.enabled || connection.status === "disconnected") return NextResponse.json({ error: "Kết nối đang bị tạm dừng.", code: "PAUSED" }, { status: 409 });
  try {
    const result = await syncConnection(connectionId, "manual", { actorUserId: access.userId, ...parsed.data });
    return NextResponse.json({ ok: true, status: syncIsPartial(result.stats) ? "partial" : "success", connectionId, stats: result.stats });
  } catch (error) {
    if (error instanceof Error && error.name === "SyncInProgressError") return NextResponse.json({ error: "Đồng bộ đang chạy.", code: "SYNC_IN_PROGRESS" }, { status: 409 });
    if (error instanceof GoogleSheetsError) {
      const status = error.code === "OAUTH_REQUIRED" || error.code === "OAUTH_REVOKED" ? 401 : error.code === "SHEET_NOT_FOUND" ? 404 : 502;
      return NextResponse.json({ error: error.message, code: error.code, retryable: error.retryable }, { status });
    }
    console.error("[google-sheets] sync failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Không thể đồng bộ lúc này.", code: "UNKNOWN", retryable: true }, { status: 502 });
  }
}
