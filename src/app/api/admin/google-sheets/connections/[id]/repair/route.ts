import { NextResponse } from "next/server";
import { planMappingRepair } from "@/lib/googleSheets/mappingRepair";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { googleSheetConnections, googleSheetRowMappings, vocabSets, words } from "@/db/schema";
import { requireAdminPermission, isAuthorizationError } from "@/lib/adminAuthorization";
import { requireAdminResourceAccess } from "@/lib/folderAuthorization";
import { writeAdminAudit } from "@/lib/adminAudit";
import { apiForUser } from "@/lib/googleSheets/sheetLifecycle";
import { acquireConnectionLock, releaseConnectionLock, markSyncPending, SyncInProgressError } from "@/lib/googleSheets/store";
import { ensureWatchChannel } from "@/lib/googleSheets/watch";
import { getGoogleSheetTemplate } from "@/lib/googleSheets/template";
import { quoteSheetTitle } from "@/lib/googleSheets/spreadsheet";
import { planSystemRepair } from "@/lib/googleSheets/repair";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const schema = z.object({ spreadsheetId: z.string().min(1), confirm: z.literal(true) }).strict();

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const access = await requireAdminPermission("google_sheets.manage");
  if (isAuthorizationError(access)) return access;
  const id = Number(params.id);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!Number.isSafeInteger(id) || id < 1 || !parsed.success) return NextResponse.json({ error: "Cần xác nhận Sheet cần sửa." }, { status: 400 });
  const [connection] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, id)).limit(1);
  if (!connection) return NextResponse.json({ error: "Không tìm thấy kết nối." }, { status: 404 });
  const [set] = await db.select().from(vocabSets).where(eq(vocabSets.id, connection.setId)).limit(1);
  if (!set) return NextResponse.json({ error: "Không tìm thấy bộ từ." }, { status: 404 });
  const scoped = await requireAdminResourceAccess({ permission: "google_sheets.manage", folderId: set.folderId, level: "editor", access });
  if (isAuthorizationError(scoped)) return scoped;
  let locked = false;
  try {
    await acquireConnectionLock(id, "repair"); locked = true;
    const [current] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, id)).limit(1);
    if (!current?.managedByLexora || current.spreadsheetId !== parsed.data.spreadsheetId || !current.enabled) return NextResponse.json({ error: "Chỉ sửa hệ thống trên Sheet do Lexora tạo, đang hoạt động và đúng file đã xác nhận." }, { status: 409 });
    const api = await apiForUser(current.createdBy ?? access.userId);
    const metadata = await api.getSpreadsheetMetadata(current.spreadsheetId);
    const tab = metadata.sheets.find(sheet => sheet.sheetId === current.sheetId);
    if (!tab) throw new Error("Tab đã kết nối không còn. Không tự chọn tab khác.");
    const range = `${quoteSheetTitle(tab.title)}!A:Z`;
    const formulas = await api.readValues(current.spreadsheetId, range, { renderOption: "FORMULA" });
    const [wordRows, mappings] = await Promise.all([db.select().from(words).where(eq(words.setId, set.id)), db.select().from(googleSheetRowMappings).where(eq(googleSheetRowMappings.connectionId, id))]);
    const plan = planSystemRepair({ formulas, template: getGoogleSheetTemplate(set), sheetTitle: tab.title, setType: set.type, words: wordRows, mappings });
    const latest = await api.readValues(current.spreadsheetId, range, { renderOption: "FORMULA" });
    if (JSON.stringify(latest) !== JSON.stringify(formulas)) throw new Error("Sheet vừa thay đổi. Hãy tạm ngừng chỉnh sửa và thử lại.");
    if (plan.updates.length) {
      if (api.batchWriteValues) await api.batchWriteValues(current.spreadsheetId, plan.updates);
      else for (const update of plan.updates) await api.writeValues(current.spreadsheetId, update.rangeA1, update.values, { parseFormulas: update.parseFormulas });
    }
    const repairedValues = await api.readValues(current.spreadsheetId, range);
    const mappingRepairs = planMappingRepair({ values: repairedValues, template: getGoogleSheetTemplate(set), setType: set.type, words: wordRows, mappings });
    if (mappingRepairs.length) await db.insert(googleSheetRowMappings).values(mappingRepairs.map(mapping => ({ ...mapping, connectionId: id })));
    await ensureWatchChannel(api, current, current.spreadsheetId);
    await db.update(googleSheetConnections).set({ sheetTitle: tab.title, externalState: "accessible", lastVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(googleSheetConnections.id, id));
    await markSyncPending(id, "system_repair");
    await writeAdminAudit({ actorUserId: access.userId, action: "google_sheet.repair", resourceType: "google_sheet_connection", resourceId: id, metadata: { setId: set.id, connectionId: id, spreadsheetId: current.spreadsheetId, idsAssigned: plan.idsAssigned, sttRepaired: plan.sttRepaired } });
    return NextResponse.json({ ok: true, idsAssigned: plan.idsAssigned, sttRepaired: plan.sttRepaired, mappingsCreated: mappingRepairs.length, pendingSync: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể sửa Sheet." }, { status: error instanceof SyncInProgressError ? 409 : 502 });
  } finally { if (locked) await releaseConnectionLock(id); }
}
