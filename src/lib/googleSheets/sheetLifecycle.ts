import { and, asc, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { googleSheetConnections, googleSheetCreateLocks, googleSheetRowMappings, vocabSets, words } from "@/db/schema";
import type { GoogleWorkspaceApi, SheetsValue } from "@/lib/googleSheets/api";
import { createGoogleWorkspaceApi } from "@/lib/googleSheets/client";
import { loadGoogleToken } from "@/lib/googleSheets/auth";
import { buildSttFormulaForRow, getGoogleSheetTemplate, SOURCE_ID_HEADER, sttColumnIndex, type GoogleSheetTemplate } from "@/lib/googleSheets/template";
import { buildRangeA1, valuesForExport, columnLetter } from "@/lib/googleSheets/spreadsheet";
import { computeWordFingerprint } from "@/lib/googleSheets/fingerprint";
import { generateSourceId } from "@/lib/googleSheets/identity";
import { readSheetGrid, runVocabularySync, type SyncConnection, type SyncStats } from "@/lib/googleSheets/syncVocabulary";
import { configureSheetLayout } from "@/lib/googleSheets/formatting";
import { ensureWatchChannel } from "@/lib/googleSheets/watch";
import {
  acquireConnectionLock, clearSyncPending, finishSyncRun, markConnectionSyncState, markSyncPending,
  releaseConnectionLock, startSyncRun, SyncInProgressError,
} from "@/lib/googleSheets/store";
import { writeAdminAudit } from "@/lib/adminAudit";
import { GoogleSheetsError, safeGoogleErrorForLogs } from "@/lib/googleSheets/errors";

export type Actor = { userId: number; displayName?: string };

function requireToken(userId: number) {
  return loadGoogleToken(userId);
}

export async function apiForUser(userId: number): Promise<GoogleWorkspaceApi> {
  const token = await requireToken(userId);
  if (!token?.refreshToken) throw new GoogleSheetsError("Bạn cần kết nối tài khoản Google trước.", "OAUTH_REQUIRED", { retryable: false });
  return createGoogleWorkspaceApi(token);
}

/** Actionable, non-technical messages shared with the create route and the UI. */
export const CONNECTED_MESSAGE = "Google Sheet đã được kết nối cho bộ từ này.";
export const RECOVER_MESSAGE = "Google Sheet đã được tạo nhưng kết nối chưa hoàn tất. Hãy khôi phục kết nối hiện có.";
export const CREATE_BUSY_MESSAGE = "Google Sheet đang được tạo bởi một yêu cầu khác. Vui lòng chờ lại.";

/**
 * Advisory lock for the create-sheet workflow, keyed by setId.
 *
 * Deliberately NOT stored in google_sheet_sync_locks: that table's
 * connection_id references google_sheet_connections(id), which does not exist
 * yet at this point - the spreadsheet is created before the connection row.
 * A stale row expires via locked_until, so a crashed create cannot block others.
 */
const CREATE_LOCK_TTL_MS = 2 * 60 * 1000;

async function acquireCreateLock(setId: number): Promise<void> {
  const now = new Date();
  const until = new Date(now.getTime() + CREATE_LOCK_TTL_MS);
  const owner = `create:${setId}`;
  const updated = await db.update(googleSheetCreateLocks)
    .set({ lockedAt: now, lockedUntil: until, lockedBy: owner })
    .where(and(eq(googleSheetCreateLocks.setId, setId), lt(googleSheetCreateLocks.lockedUntil, now)))
    .returning({ setId: googleSheetCreateLocks.setId });
  if (updated.length) return;
  const inserted = await db.insert(googleSheetCreateLocks)
    .values({ setId, lockedAt: now, lockedUntil: until, lockedBy: owner })
    .onConflictDoNothing({ target: googleSheetCreateLocks.setId })
    .returning({ setId: googleSheetCreateLocks.setId });
  if (!inserted.length) throw new GoogleSheetsError(CREATE_BUSY_MESSAGE, "RATE_LIMITED", { retryable: true, status: 409 });
}

async function releaseCreateLock(setId: number): Promise<void> {
  await db.delete(googleSheetCreateLocks).where(and(eq(googleSheetCreateLocks.setId, setId), eq(googleSheetCreateLocks.lockedBy, `create:${setId}`)));
}

export type CreateSheetResult = {
  connectionId: number;
  spreadsheetId: string;
  spreadsheetUrl: string;
  sheetId: number;
  sheetTitle: string;
  status: string;
  exportedRows: number;
};

/**
 * Main workflow: create a spreadsheet, write the current vocabulary into it,
 * save the connection + row mappings and start the watch channel.
 */
export async function createGoogleSheetForSet(setId: number, actor: Actor, apiOverride?: GoogleWorkspaceApi): Promise<CreateSheetResult> {
  const [set] = await db.select().from(vocabSets).where(eq(vocabSets.id, setId)).limit(1);
  if (!set) throw new GoogleSheetsError("Không tìm thấy bộ từ vựng.", "SHEET_NOT_FOUND", { retryable: false });
  // A healthy existing connection is an idempotent no-op (mapped to a 200 by the
  // create route), and a broken one is recovered by the recover endpoint. Neither
  // is a reason to spawn a second spreadsheet.
  const [existing] = await db.select({ id: googleSheetConnections.id, status: googleSheetConnections.status, enabled: googleSheetConnections.enabled }).from(googleSheetConnections).where(eq(googleSheetConnections.setId, setId)).limit(1);
  if (existing && existing.enabled && (existing.status === "connected" || existing.status === "syncing")) {
    const already = new GoogleSheetsError(CONNECTED_MESSAGE, "INVALID_SCHEMA", { retryable: false, status: 409 });
    (already as unknown as Record<string, unknown>).alreadyConnected = true;
    throw already;
  }
  if (existing) {
    const recoverable = new GoogleSheetsError(RECOVER_MESSAGE, "INVALID_SCHEMA", { retryable: false, status: 409 });
    (recoverable as unknown as Record<string, unknown>).needsRecovery = true;
    throw recoverable;
  }
  // Concurrency guard: two simultaneous create requests for the same set must not
  // spawn two spreadsheets. Reuses the lock table with a create-scoped owner so a
  // crashed process releases it after the TTL, exactly like the sync lock.
  await acquireCreateLock(setId);

  // Everything below runs inside the try so the lock is released even when the
  // Google API call, the token load, or any DB write fails. The previous code
  // had createSpreadsheet outside the try, which leaked the lock and made the
  // next create fail with an opaque 502 instead of a meaningful message.
  let connectionId: number | null = null;
  let created: Awaited<ReturnType<GoogleWorkspaceApi["createSpreadsheet"]>> | null = null;
  const template = getGoogleSheetTemplate(set);
  try {
    const api = apiOverride ?? await apiForUser(actor.userId);
    created = await api.createSpreadsheet({ title: `${set.name} – Google Sheet`, sheetTitle: template.sheetTitle });
    const wordRows = await db.select().from(words).where(eq(words.setId, setId)).orderBy(asc(words.position), asc(words.id));
    const exportRows = wordRows.map((word) => ({
      sourceId: generateSourceId(),
      values: exportValuesForWord(template, word),
    }));
    const values = valuesForExport(template, exportRows);
    const rangeA1 = buildRangeA1(template.sheetTitle, template.fields.length, values.length);
    await api.writeValues(created.spreadsheetId, rangeA1, values);
    // STT is a spreadsheet-side display number: a single relative formula filled
    // down the column renumbers itself whenever rows are added, deleted or
    // sorted. Nothing is ever written back to the database for it.
    try {
      await writeSttFormula(api, created.spreadsheetId, template, values.length);
    } catch (error) {
      console.warn("[google-sheets] STT formula skipped:", error instanceof Error ? error.message : "unknown");
    }
    // Formatting is cosmetic. A bad request there (wrong field name, new API
    // value, quota) must never abandon the connection now that the vocabulary
    // has already been written - log and continue instead.
    try {
      await configureSheetLayout(api as never, { spreadsheetId: created.spreadsheetId, sheetId: created.sheetId, template, rowCount: exportRows.length });
    } catch (error) {
      console.warn("[google-sheets] sheet layout skipped:", error instanceof Error ? error.message : "unknown");
    }

    const [connection] = await db.insert(googleSheetConnections).values({
      setId,
      createdBy: actor.userId,
      spreadsheetId: created.spreadsheetId,
      spreadsheetUrl: created.spreadsheetUrl,
      spreadsheetName: created.spreadsheetName,
      sheetId: created.sheetId,
      sheetTitle: created.sheetTitle,
      rangeA1,
      templateType: template.templateType,
      templateVersion: template.templateVersion,
      syncDirection: "google_to_lexora",
      deleteBehavior: "archive",
      enabled: true,
      status: "connected",
      lastSyncedAt: new Date(),
      lastSuccessfulSyncAt: new Date(),
    }).returning({ id: googleSheetConnections.id });
    connectionId = connection.id;

    const createdConnectionId = connectionId;
    const mappingValues = wordRows.map((word, index) => ({
      connectionId: createdConnectionId,
      wordId: word.id,
      sourceId: exportRows[index].sourceId,
      sheetRowNumber: index + 2,
      sourceFingerprint: computeWordFingerprint(set.type, exportValuesForWord(template, word)),
      lastSyncedFingerprint: computeWordFingerprint(set.type, exportValuesForWord(template, word)),
    }));
    if (mappingValues.length) await db.insert(googleSheetRowMappings).values(mappingValues);

    await ensureWatchChannel(api, { id: connectionId, spreadsheetId: created.spreadsheetId, createdBy: actor.userId }, created.spreadsheetId);
    await writeAdminAudit({ actorUserId: actor.userId, action: "google_sheet.create", resourceType: "vocab_set", resourceId: setId, metadata: { connectionId, spreadsheetId: created.spreadsheetId, exportedRows: exportRows.length, templateType: template.templateType, templateVersion: template.templateVersion } });
    return { connectionId, spreadsheetId: created.spreadsheetId, spreadsheetUrl: created.spreadsheetUrl, sheetId: created.sheetId, sheetTitle: created.sheetTitle, status: "connected", exportedRows: exportRows.length };
  } catch (error) {
    // Spreadsheet exists but DB wiring failed: surface an orphaned resource so an
    // admin can retry/cleanup instead of silently believing it is connected.
    if (connectionId === null && created?.spreadsheetId) {
      await db.insert(googleSheetConnections).values({
        setId, createdBy: actor.userId, spreadsheetId: created.spreadsheetId, spreadsheetUrl: created.spreadsheetUrl,
        spreadsheetName: created.spreadsheetName, sheetId: created.sheetId, sheetTitle: created.sheetTitle,
        rangeA1: buildRangeA1(template.sheetTitle, template.fields.length, 1), templateType: template.templateType,
        templateVersion: template.templateVersion, syncDirection: "google_to_lexora", deleteBehavior: "archive",
        enabled: false, status: "error", lastError: safeGoogleErrorForLogs(error),
      }).returning({ id: googleSheetConnections.id }).then((rows) => rows[0]?.id ?? null).catch(() => null);
    }
    throw error;
  } finally {
    await releaseCreateLock(setId);
  }
}

/**
 * Fill the display-only STT column with the renumbering formula.
 *
 * Every row gets its own formula with the row reference advanced, because
 * values.update writes literals (Sheets cannot shift a single formula through
 * that call). All rows are written in one request, and the formula renumbers
 * itself whenever rows are added, deleted, sorted or filtered — nothing is ever
 * written back to the database for STT.
 */
async function writeSttFormula(api: GoogleWorkspaceApi, spreadsheetId: string, template: GoogleSheetTemplate, rowCount: number): Promise<void> {
  if (rowCount < 1) return;
  const letter = columnLetter(sttColumnIndex(template));
  const lastRow = rowCount + 1; // + header row
  const values: (string | number)[][] = [];
  for (let row = 2; row <= lastRow; row += 1) values.push([buildSttFormulaForRow(template, row)]);
  const range = `'${template.sheetTitle.replace(/'/g, "''")}'!${letter}2:${letter}${lastRow}`;
  await api.writeValues(spreadsheetId, range, values as never);
}

export function exportValuesForWord(template: GoogleSheetTemplate, word: typeof words.$inferSelect): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of template.fields) {
    if (field.key === SOURCE_ID_HEADER) continue;
    const value = (word as unknown as Record<string, unknown>)[field.key];
    values[field.key] = value == null ? "" : String(value);
  }
  return values;
}

export type SyncOutcome = { stats: SyncStats; connectionId: number };

/**
 * Run one sync for a connection (webhook, manual, cron or initial). Throws
 * SyncInProgressError when the connection-level lock is already held.
 */
export async function syncConnection(connectionId: number, trigger: "manual" | "webhook" | "cron" | "initial" | "lexora", options?: { actorUserId?: number; apiOverride?: GoogleWorkspaceApi }): Promise<SyncOutcome> {
  const [connection] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, connectionId)).limit(1);
  if (!connection) throw new GoogleSheetsError("Không tìm thấy kết nối Google Sheet.", "SHEET_NOT_FOUND", { retryable: false });
  if (!connection.enabled || connection.status === "disconnected") throw new GoogleSheetsError("Kết nối đang bị tạm dừng.", "INVALID_SCHEMA", { retryable: false });

  await acquireConnectionLock(connectionId, trigger);
  await db.update(googleSheetConnections).set({ status: "syncing", updatedAt: new Date() }).where(eq(googleSheetConnections.id, connectionId));
  const runId = await startSyncRun(connectionId, trigger);
  try {
    const actorUserId = options?.actorUserId ?? connection.createdBy;
    const api = options?.apiOverride ?? (actorUserId ? await apiForUser(actorUserId) : null);
    if (!api) throw new GoogleSheetsError("Thiếu tư cách xác thực Google.", "OAUTH_REQUIRED", { retryable: false });
    const grid = await readSheetGrid(connection as SyncConnection, (spreadsheetId, range) => api.readValues(spreadsheetId, range));
    const result = await db.transaction(async (tx) => runVocabularySync(connection as SyncConnection, grid, tx));
    await writeBackSourceIds(api, connection, templateFor(connection), result.stats.idWrites);
    await finishSyncRun(runId, "success", {
      rowsRead: result.stats.rowsRead, rowsCreated: result.stats.rowsCreated, rowsUpdated: result.stats.rowsUpdated,
      rowsDeleted: result.stats.rowsDeleted, rowsUnchanged: result.stats.rowsUnchanged, rowsSkipped: result.stats.rowsSkipped,
      duplicateCount: result.stats.duplicateCount, validationErrorCount: result.stats.validationErrorCount,
      metadata: { conflicts: result.stats.conflicts.length, trigger },
    });
    await markConnectionSyncState(connectionId, { ok: true });
    await clearSyncPending(connectionId);
    if (trigger !== "initial") await writeAdminAudit({ actorUserId: options?.actorUserId ?? connection.createdBy ?? 1, action: "google_sheet.sync", resourceType: "google_sheet_connection", resourceId: connectionId, metadata: { trigger, created: result.stats.rowsCreated, updated: result.stats.rowsUpdated, unchanged: result.stats.rowsUnchanged, deleted: result.stats.rowsDeleted, conflicts: result.stats.conflicts.length } });
    return { stats: result.stats, connectionId };
  } catch (error) {
    const message = safeGoogleErrorForLogs(error);
    const retryable = error instanceof GoogleSheetsError ? error.retryable : true;
    await finishSyncRun(runId, "error", { errorMessage: message });
    await markConnectionSyncState(connectionId, { ok: false, error: message, retryable });
    await markSyncPending(connectionId, "retry");
    throw error;
  } finally {
    await releaseConnectionLock(connectionId);
    const [current] = await db.select({ status: googleSheetConnections.status }).from(googleSheetConnections).where(eq(googleSheetConnections.id, connectionId)).limit(1);
    if (current?.status === "syncing") await db.update(googleSheetConnections).set({ status: "connected", updatedAt: new Date() }).where(eq(googleSheetConnections.id, connectionId));
  }
}

async function writeBackSourceIds(api: GoogleWorkspaceApi, connection: { spreadsheetId: string; sheetTitle: string }, template: GoogleSheetTemplate, idWrites: Array<{ rowNumber: number; sourceId: string }>) {
  if (!idWrites.length) return;
  const idColumn = columnLetter(template.fields.findIndex((field) => field.key === SOURCE_ID_HEADER));
  const sorted = [...idWrites].sort((left, right) => left.rowNumber - right.rowNumber);
  const startRow = sorted[0].rowNumber;
  const values: (string | number)[][] = [];
  let cursor = startRow;
  for (const write of sorted) {
    while (cursor < write.rowNumber) { values.push([""]); cursor += 1; }
    values.push([write.sourceId]);
    cursor += 1;
  }
  const range = `'${connection.sheetTitle.replace(/'/g, "''")}'!${idColumn}${startRow}:${idColumn}${startRow + values.length - 1}`;
  await api.writeValues(connection.spreadsheetId, range, values as SheetsValue);
}

function templateFor(connection: { templateType: string; sheetTitle: string }): GoogleSheetTemplate {
  const isIrregular = connection.templateType === "irregular_verb";
  const isMandarin = connection.templateType === "language_vocab_mandarin";
  return getGoogleSheetTemplate(isIrregular ? { type: "irregular_verb", languageCode: "en" } : { type: "ielts_vocab", languageCode: isMandarin ? "zh-CN" : "en" });
}
export { SyncInProgressError };
