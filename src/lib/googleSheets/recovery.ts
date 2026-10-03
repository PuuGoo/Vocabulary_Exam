import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { googleSheetConnections, googleSheetRowMappings, vocabSets, words } from "@/db/schema";
import type { GoogleWorkspaceApi } from "@/lib/googleSheets/api";
import { apiForUser, exportValuesForWord, syncConnection } from "@/lib/googleSheets/sheetLifecycle";
import { getGoogleSheetTemplate } from "@/lib/googleSheets/template";
import { buildRangeA1 } from "@/lib/googleSheets/spreadsheet";
import { fingerprintDbWord } from "@/lib/googleSheets/fingerprint";
import { generateSourceId } from "@/lib/googleSheets/identity";
import { ensureWatchChannel } from "@/lib/googleSheets/watch";
import { writeAdminAudit } from "@/lib/adminAudit";
import { GoogleSheetsError } from "@/lib/googleSheets/errors";

/**
 * Connection-state helpers + the recovery flow for Google Sheets.
 *
 * A google_sheet_connections row is *not* proof that a working integration
 * exists: the create flow writes the spreadsheet first and the DB second, so a
 * failure in between leaves status=error/enabled=false with the spreadsheet
 * already created. Treating every row as "already connected" (the old 409)
 * therefore blocked admins from ever fixing it, while the UI - which labels
 * based on status - said "Chưa kết nối".
 *
 * The rules are intentionally strict about never creating a second spreadsheet:
 * recovery is attempted first, and a new spreadsheet is only ever created when
 * the old one is verifiably gone (SHEET_NOT_FOUND).
 */

export { connectionView, connectionViewMessage, isActiveConnectionState, isPausedConnectionState, isBrokenConnectionState, type ConnectionView } from "@/lib/googleSheets/recoveryState";

export type ConnectionSummary = {
  id: number;
  setId: number;
  spreadsheetId: string;
  spreadsheetUrl: string;
  sheetId: number;
  sheetTitle: string;
  enabled: boolean;
  status: string;
};

export async function loadConnectionForSet(setId: number): Promise<ConnectionSummary | null> {
  const [connection] = await db.select({
    id: googleSheetConnections.id,
    setId: googleSheetConnections.setId,
    spreadsheetId: googleSheetConnections.spreadsheetId,
    spreadsheetUrl: googleSheetConnections.spreadsheetUrl,
    sheetId: googleSheetConnections.sheetId,
    sheetTitle: googleSheetConnections.sheetTitle,
    enabled: googleSheetConnections.enabled,
    status: googleSheetConnections.status,
  }).from(googleSheetConnections).where(eq(googleSheetConnections.setId, setId)).orderBy(googleSheetConnections.id).limit(1);
  return connection ?? null;
}

export type RecoveryResult = {
  connectionId: number;
  spreadsheetId: string;
  spreadsheetUrl: string;
  sheetId: number;
  sheetTitle: string;
  status: string;
  recovered: boolean;
  mappingsCreated: number;
  stats?: { rowsCreated: number; rowsUpdated: number; rowsUnchanged: number; rowsDeleted: number };
  message: string;
};

/**
 * Recover an existing google_sheet_connections row.
 *
 * Steps: verify Google access -> refresh sheet metadata -> repair row mappings
 * -> repair the Drive watch channel -> re-enable + connected -> sync once.
 * Throws SHEET_NOT_FOUND (non-retryable) when the spreadsheet is truly gone, so
 * the caller can offer "create a new sheet" instead of silently duplicating.
 *
 * Never deletes the connection row, so spreadsheetId, row mappings and sync
 * history all survive a recovery.
 */
export async function recoverGoogleSheetConnection(
  connectionId: number,
  actor: { userId: number },
  apiOverride?: GoogleWorkspaceApi,
): Promise<RecoveryResult> {
  const [connection] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, connectionId)).limit(1);
  if (!connection) throw new GoogleSheetsError("Không tìm thấy kết nối Google Sheet.", "SHEET_NOT_FOUND", { retryable: false });

  const api = apiOverride ?? await apiForUser(actor.userId);

  // 1) Does the existing spreadsheet still exist and do we still have access?
  let accessible: boolean;
  try {
    accessible = await api.verifyAccess(connection.spreadsheetId);
  } catch (error) {
    if (error instanceof GoogleSheetsError && error.code === "SHEET_NOT_FOUND") accessible = false;
    else throw error;
  }
  if (!accessible) {
    await db.update(googleSheetConnections)
      .set({ status: "error", enabled: false, lastError: "Google Sheet không còn tồn tại hoặc đã mất quyền truy cập.", lastErrorAt: new Date(), updatedAt: new Date() })
      .where(eq(googleSheetConnections.id, connectionId));
    throw new GoogleSheetsError("Không thể truy cập Google Sheet cũ. Bạn có thể tạo Sheet mới.", "SHEET_NOT_FOUND", { retryable: false });
  }

  // 2) Refresh metadata (tab may have been renamed or recreated).
  const [set] = await db.select().from(vocabSets).where(eq(vocabSets.id, connection.setId)).limit(1);
  if (!set) throw new GoogleSheetsError("Không tìm thấy bộ từ vựng.", "SHEET_NOT_FOUND", { retryable: false });
  const metadata = await api.getSpreadsheetMetadata(connection.spreadsheetId);
  const tab = metadata.sheets.find((sheet) => sheet.sheetId === connection.sheetId)
    ?? metadata.sheets.find((sheet) => sheet.title === connection.sheetTitle)
    ?? metadata.sheets[0];
  if (!tab) throw new GoogleSheetsError("Không tìm thấy tab của Google Sheet.", "INVALID_SCHEMA", { retryable: false });
  const template = getGoogleSheetTemplate(set);

  // 3) Repair row mappings for words that never got one (wiring failed mid-create).
  const wordRows = await db.select().from(words).where(eq(words.setId, connection.setId)).orderBy(asc(words.position), asc(words.id));
  const existingMappings = await db.select({ wordId: googleSheetRowMappings.wordId })
    .from(googleSheetRowMappings).where(eq(googleSheetRowMappings.connectionId, connectionId));
  const mappedWordIds = new Set(existingMappings.flatMap((row) => (row.wordId == null ? [] : [row.wordId])));
  const missing = wordRows.filter((word) => !mappedWordIds.has(word.id));
  let mappingsCreated = 0;
  if (missing.length) {
    await db.insert(googleSheetRowMappings).values(missing.map((word) => {
      const fingerprint = fingerprintDbWord(template, word as unknown as Record<string, unknown>);
      // sheetRowNumber 0 = "unknown position"; the first sync resolves it from
      // the __lexora_id column it writes back into the sheet.
      return { connectionId, wordId: word.id, sourceId: generateSourceId(), sheetRowNumber: 0, sourceFingerprint: fingerprint, lastSyncedFingerprint: fingerprint };
    }));
    mappingsCreated = missing.length;
  }

  // 4) Repair the Drive watch channel (fresh channel id + token when the old one
  //    is missing, expired or tokenless).
  await ensureWatchChannel(api, { id: connectionId, spreadsheetId: connection.spreadsheetId, createdBy: connection.createdBy }, connection.spreadsheetId);

  // 5) Re-enable and mark connected *before* the sync so the UI stops showing an
  //    error/"Chưa kết nối" state immediately, even if the sync itself is slow.
  await db.update(googleSheetConnections).set({
    enabled: true,
    status: "connected",
    sheetId: tab.sheetId,
    sheetTitle: tab.title,
    rangeA1: buildRangeA1(tab.title, template.fields.length, Math.max(1, wordRows.length)),
    lastError: null,
    lastErrorAt: null,
    updatedAt: new Date(),
  }).where(eq(googleSheetConnections.id, connectionId));

  await writeAdminAudit({
    actorUserId: actor.userId,
    action: "google_sheet.recover",
    resourceType: "google_sheet_connection",
    resourceId: connectionId,
    metadata: { setId: connection.setId, spreadsheetId: connection.spreadsheetId, mappingsCreated, sheetTitle: tab.title },
  });

  // 6) One sync so sheet and DB converge after recovery. A failure here is not
  //    fatal: the connection stays usable and the next manual/webhook sync retries.
  let stats: RecoveryResult["stats"];
  try {
    const outcome = await syncConnection(connectionId, "initial", { actorUserId: actor.userId, apiOverride: api });
    stats = { rowsCreated: outcome.stats.rowsCreated, rowsUpdated: outcome.stats.rowsUpdated, rowsUnchanged: outcome.stats.rowsUnchanged, rowsDeleted: outcome.stats.rowsDeleted };
  } catch (error) {
    if (error instanceof GoogleSheetsError && error.code === "SHEET_NOT_FOUND") throw error;
    console.warn("[google-sheets] post-recovery sync skipped:", error instanceof Error ? error.message : "unknown");
  }

  const [fresh] = await db.select({ status: googleSheetConnections.status, sheetId: googleSheetConnections.sheetId, sheetTitle: googleSheetConnections.sheetTitle })
    .from(googleSheetConnections).where(eq(googleSheetConnections.id, connectionId)).limit(1);
  return {
    connectionId,
    spreadsheetId: connection.spreadsheetId,
    spreadsheetUrl: connection.spreadsheetUrl,
    sheetId: fresh?.sheetId ?? tab.sheetId,
    sheetTitle: fresh?.sheetTitle ?? tab.title,
    status: fresh?.status ?? "connected",
    recovered: true,
    mappingsCreated,
    stats,
    message: "Đã khôi phục kết nối Google Sheet.",
  };
}