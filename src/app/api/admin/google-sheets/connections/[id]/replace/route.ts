import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { googleSheetConnections, vocabSets } from "@/db/schema";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { requireAdminResourceAccess } from "@/lib/folderAuthorization";
import { replaceGoogleSheet } from "@/lib/googleSheets/replacement";
import { GoogleSheetsError } from "@/lib/googleSheets/errors";
import { SyncInProgressError } from "@/lib/googleSheets/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const schema = z.object({ spreadsheetId: z.string().min(1), confirm: z.literal(true), trashPrevious: z.boolean().default(false) }).strict();

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const access = await requireAdminPermission("google_sheets.manage");
  if (isAuthorizationError(access)) return access;
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "Không tìm thấy kết nối." }, { status: 404 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Cần xác nhận Sheet sẽ thay thế." }, { status: 400 });
  const [connection] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, id)).limit(1);
  if (!connection) return NextResponse.json({ error: "Không tìm thấy kết nối." }, { status: 404 });
  const [set] = await db.select().from(vocabSets).where(eq(vocabSets.id, connection.setId)).limit(1);
  const scoped = await requireAdminResourceAccess({ permission: "google_sheets.manage", folderId: set?.folderId, level: "editor", access });
  if (isAuthorizationError(scoped)) return scoped;
  try {
    const result = await replaceGoogleSheet(id, access.userId, parsed.data.spreadsheetId, { trashPrevious: parsed.data.trashPrevious });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof SyncInProgressError) return NextResponse.json({ error: "Một thao tác khác đang chạy. Hãy thử lại." }, { status: 409 });
    if (error instanceof GoogleSheetsError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status === 409 ? 409 : error.status === 403 ? 403 : 502 });
    return NextResponse.json({ error: "Chưa hoàn tất thay Sheet. Hãy kiểm tra trạng thái kết nối và tài nguyên tạo dở trước khi thử lại." }, { status: 502 });
  }
}
