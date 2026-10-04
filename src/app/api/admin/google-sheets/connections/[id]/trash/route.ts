import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { googleSheetConnections, googleSheetSyncChannels, vocabSets } from "@/db/schema";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { requireAdminResourceAccess } from "@/lib/folderAuthorization";
import { writeAdminAudit } from "@/lib/adminAudit";
import { apiForUser } from "@/lib/googleSheets/sheetLifecycle";
import { acquireConnectionLock, clearSyncPending, releaseConnectionLock, SyncInProgressError } from "@/lib/googleSheets/store";
import { GoogleSheetsError } from "@/lib/googleSheets/errors";
import { trashManagedSpreadsheet } from "@/lib/googleSheets/resourceSafety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const schema = z.object({ spreadsheetId: z.string().min(1), confirm: z.literal(true) }).strict();

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireAdminPermission("google_sheets.manage");
  if (isAuthorizationError(access)) return access;
  const connectionId = Number(params.id);
  if (!Number.isSafeInteger(connectionId) || connectionId < 1) return NextResponse.json({ error: "Không tìm thấy kết nối." }, { status: 404 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Cần xác nhận Sheet trước khi đưa vào Thùng rác." }, { status: 400 });
  let locked = false;
  try {
    const [connection] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, connectionId)).limit(1);
    if (!connection) return NextResponse.json({ error: "Không tìm thấy kết nối." }, { status: 404 });
    const [set] = await db.select().from(vocabSets).where(eq(vocabSets.id, connection.setId)).limit(1);
    if (!set) return NextResponse.json({ error: "Không tìm thấy bộ từ." }, { status: 404 });
    const scoped = await requireAdminResourceAccess({ permission: "google_sheets.manage", folderId: set.folderId, level: "editor", access });
    if (isAuthorizationError(scoped)) return scoped;
    await acquireConnectionLock(connectionId, "trash");
    locked = true;
    const [current] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, connectionId)).limit(1);
    if (!current || !current.managedByLexora) return NextResponse.json({ error: "Không được đưa Sheet bên ngoài vào Thùng rác." }, { status: 403 });
    const api = await apiForUser(current.createdBy ?? access.userId);
    await trashManagedSpreadsheet(current, parsed.data.spreadsheetId, api);
    await db.transaction(async (tx) => {
      await tx.update(googleSheetConnections).set({ enabled: false, status: "archived", externalState: "missing", externalDeletedAt: new Date(), updatedAt: new Date() }).where(eq(googleSheetConnections.id, connectionId));
      await tx.update(googleSheetSyncChannels).set({ status: "stopped", updatedAt: new Date() }).where(eq(googleSheetSyncChannels.connectionId, connectionId));
      await writeAdminAudit({ actorUserId: access.userId, action: "google_sheet.trash", resourceType: "google_sheet_connection", resourceId: connectionId, metadata: { setId: current.setId, connectionId, spreadsheetId: current.spreadsheetId, reason: "explicit_confirmation", vocabularyPreserved: true } }, tx);
    });
    await clearSyncPending(connectionId);
    const channels = await db.select().from(googleSheetSyncChannels).where(eq(googleSheetSyncChannels.connectionId, connectionId));
    let watchCleanupPending = false;
    for (const channel of channels) {
      try { if (channel.resourceId) await api.stopWatchChannel?.(channel.channelId, channel.resourceId); }
      catch { watchCleanupPending = true; }
    }
    return NextResponse.json({ ok: true, vocabularyPreserved: true, watchCleanupPending });
  } catch (error) {
    if (error instanceof SyncInProgressError) return NextResponse.json({ error: "Đồng bộ đang chạy. Vui lòng thử lại." }, { status: 409 });
    if (error instanceof GoogleSheetsError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status === 403 ? 403 : error.status === 409 ? 409 : 502 });
    return NextResponse.json({ error: "Không thể hoàn tất thao tác. Hãy kiểm tra trạng thái Sheet trước khi thử lại." }, { status: 502 });
  } finally {
    if (locked) await releaseConnectionLock(connectionId);
  }
}
