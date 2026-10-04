import { NextResponse } from "next/server";
import { parseAiPromptOverrides } from "@/lib/googleSheets/aiFormula";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { googleSheetConnections, googleSheetRowMappings, googleSheetSyncChannels, vocabSets } from "@/db/schema";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { requireAdminResourceAccess } from "@/lib/folderAuthorization";
import { apiForUser } from "@/lib/googleSheets/sheetLifecycle";
import { getGoogleSheetTemplate } from "@/lib/googleSheets/template";
import { quoteSheetTitle } from "@/lib/googleSheets/spreadsheet";
import { inspectSheetHealth } from "@/lib/googleSheets/health";
import { GoogleSheetsError } from "@/lib/googleSheets/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const access = await requireAdminPermission("google_sheets.view");
  if (isAuthorizationError(access)) return access;
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "Không tìm thấy kết nối." }, { status: 404 });
  const [connection] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, id)).limit(1);
  if (!connection) return NextResponse.json({ error: "Không tìm thấy kết nối." }, { status: 404 });
  const [set] = await db.select().from(vocabSets).where(eq(vocabSets.id, connection.setId)).limit(1);
  if (!set) return NextResponse.json({ error: "Không tìm thấy bộ từ." }, { status: 404 });
  const scoped = await requireAdminResourceAccess({ permission: "google_sheets.view", folderId: set.folderId, level: "viewer", access });
  if (isAuthorizationError(scoped)) return scoped;
  try {
    const api = await apiForUser(connection.createdBy ?? access.userId);
    const metadata = await api.getSpreadsheetMetadata(connection.spreadsheetId);
    const tab = metadata.sheets.find(sheet => sheet.sheetId === connection.sheetId);
    if (!tab) return NextResponse.json({ healthy: false, issues: [{ code: "TAB_MISSING", message: "Tab đã kết nối không còn trong spreadsheet. Từ vựng vẫn được giữ nguyên." }], rowsScanned: 0, pendingAiCells: 0, checkedAt: new Date().toISOString() });
    const range = `${quoteSheetTitle(tab.title)}!A:Z`;
    const [values, formulas, mappings, channels] = await Promise.all([
      api.readValues(connection.spreadsheetId, range),
      api.readValues(connection.spreadsheetId, range, { renderOption: "FORMULA" }),
      db.select().from(googleSheetRowMappings).where(eq(googleSheetRowMappings.connectionId, id)),
      db.select().from(googleSheetSyncChannels).where(eq(googleSheetSyncChannels.connectionId, id)),
    ]);
    const report = inspectSheetHealth({ values, formulas, template: getGoogleSheetTemplate(set), setType: set.type, mappings, channel: channels.find(channel => channel.status === "active") ?? null, enabled: connection.enabled, status: connection.status, templateVersion: connection.templateVersion, aiPrompts: parseAiPromptOverrides(connection.aiPrompts) });
    if (tab.title !== connection.sheetTitle) {
      report.healthy = false;
      report.issues.push({ code: "TAB_RENAMED", message: `Tab đã đổi tên thành “${tab.title}”. Cần cập nhật liên kết để tiếp tục đồng bộ.` });
    }
    return NextResponse.json(report);
  } catch (error) {
    const code = error instanceof GoogleSheetsError ? error.code : "UNKNOWN";
    const messages: Record<string, string> = { OAUTH_REQUIRED: "Cần kết nối Google.", OAUTH_REVOKED: "Quyền Google đã hết hiệu lực. Hãy kết nối lại.", PERMISSION_DENIED: "Lexora không còn quyền truy cập Sheet.", SHEET_NOT_FOUND: "Không tìm thấy hoặc không thể truy cập Google Sheet. Từ vựng vẫn được giữ nguyên." };
    return NextResponse.json({ healthy: false, issues: [{ code, message: messages[code] || "Không thể hoàn tất kiểm tra Google. Vui lòng thử lại." }], rowsScanned: 0, pendingAiCells: 0, checkedAt: new Date().toISOString() });
  }
}
