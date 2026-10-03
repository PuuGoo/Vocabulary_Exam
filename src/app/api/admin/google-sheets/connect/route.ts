import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { requireAdminResourceAccess } from "@/lib/folderAuthorization";
import { db } from "@/db";
import { googleSheetConnections, vocabSets } from "@/db/schema";
import { apiForUser, syncConnection } from "@/lib/googleSheets/sheetLifecycle";
import { parseSpreadsheetUrl } from "@/lib/googleSheets/spreadsheet";
import { getGoogleSheetTemplate } from "@/lib/googleSheets/template";
import { ensureWatchChannel } from "@/lib/googleSheets/watch";
import { writeAdminAudit } from "@/lib/adminAudit";
import { GoogleSheetsError } from "@/lib/googleSheets/errors";
import { gridFromValuesRange, parseSheetGrid } from "@/lib/googleSheets/parser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({ setId: z.number().int().positive(), spreadsheetUrl: z.string().trim().min(1).max(2048), sheetTitle: z.string().trim().min(1).max(255), preview: z.boolean().optional(), deleteBehavior: z.enum(["archive", "delete", "ignore"]).optional() });

export async function POST(req: NextRequest) {
  const access = await requireAdminPermission("google_sheets.manage");
  if (isAuthorizationError(access)) return access;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Cần setId, link Google Sheet và tên tab." }, { status: 400 });
  const { setId, spreadsheetUrl, sheetTitle, deleteBehavior } = parsed.data;
  const spreadsheetId = parseSpreadsheetUrl(spreadsheetUrl);
  if (!spreadsheetId) return NextResponse.json({ error: "Link Google Sheets không hợp lệ." }, { status: 400 });
  const [set] = await db.select().from(vocabSets).where(eq(vocabSets.id, setId)).limit(1);
  if (!set) return NextResponse.json({ error: "Không tìm thấy bộ từ vựng." }, { status: 404 });
  const scoped = await requireAdminResourceAccess({ permission: "google_sheets.manage", folderId: set.folderId, level: "editor", access });
  if (isAuthorizationError(scoped)) return scoped;
  const [existing] = await db.select({ id: googleSheetConnections.id }).from(googleSheetConnections).where(eq(googleSheetConnections.setId, setId)).limit(1);
  if (existing) return NextResponse.json({ error: "Bộ từ vựng này đã kết nối Google Sheet." }, { status: 409 });

  try {
    const api = await apiForUser(access.userId);
    if (!await api.verifyAccess(spreadsheetId)) return NextResponse.json({ error: "Không có quyền truy cập spreadsheet này." }, { status: 403 });
    const metadata = await api.getSpreadsheetMetadata(spreadsheetId);
    const tab = metadata.sheets.find((sheet) => sheet.title === sheetTitle) ?? metadata.sheets[0];
    if (!tab) return NextResponse.json({ error: "Không tìm thấy tab đã chọn." }, { status: 404 });
    const template = getGoogleSheetTemplate(set);
    if (parsed.data.preview) {
      const range = `'${tab.title.replace(/'/g, "''")}'!A:Z`;
      const rows = parseSheetGrid(gridFromValuesRange(await api.readValues(spreadsheetId, range)), template);
      return NextResponse.json({ tabs: metadata.sheets, sheetTitle: tab.title, templateType: template.templateType, totalRows: rows.length, previewRows: rows.slice(0, 5).map((row) => ({ rowNumber: row.rowNumber, values: row.values })) });
    }
    const [connection] = await db.insert(googleSheetConnections).values({
      setId, createdBy: access.userId, spreadsheetId, spreadsheetUrl, spreadsheetName: set.name,
      sheetId: tab.sheetId, sheetTitle: tab.title, rangeA1: `'${tab.title.replace(/'/g, "''")}'!A:Z`,
      templateType: template.templateType, templateVersion: template.templateVersion,
      syncDirection: "google_to_lexora", deleteBehavior: deleteBehavior ?? "archive", enabled: true, status: "connected",
    }).returning({ id: googleSheetConnections.id });
    await ensureWatchChannel(api, { id: connection.id, spreadsheetId, createdBy: access.userId }, spreadsheetId);
    await writeAdminAudit({ actorUserId: access.userId, action: "google_sheet.connect", resourceType: "vocab_set", resourceId: setId, metadata: { connectionId: connection.id, spreadsheetId, sheetTitle: tab.title } });
    const initial = await syncConnection(connection.id, "initial", { actorUserId: access.userId, apiOverride: api });
    await writeAdminAudit({ actorUserId: access.userId, action: "google_sheet.initial_sync", resourceType: "google_sheet_connection", resourceId: connection.id, metadata: { created: initial.stats.rowsCreated, updated: initial.stats.rowsUpdated } });
    return NextResponse.json({ connectionId: connection.id, spreadsheetId, spreadsheetUrl, sheetId: tab.sheetId, sheetTitle: tab.title, status: "connected", stats: initial.stats }, { status: 201 });
  } catch (error) {
    if (error instanceof GoogleSheetsError) return NextResponse.json({ error: error.message, code: error.code, retryable: error.retryable }, { status: error.code === "OAUTH_REQUIRED" ? 401 : 502 });
    console.error("[google-sheets] connect failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Không thể kết nối Google Sheet." }, { status: 502 });
  }
}
