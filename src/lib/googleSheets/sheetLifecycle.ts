import { and, asc, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { googleSheetConnections, googleSheetCreateLocks, googleSheetRowMappings, googleSheetSyncRuns, vocabSets, words } from "@/db/schema";
import type { GoogleWorkspaceApi, SheetsValue } from "@/lib/googleSheets/api";
import { createGoogleWorkspaceApi } from "@/lib/googleSheets/client";
import { loadGoogleToken } from "@/lib/googleSheets/auth";
import { buildSttFormulaForRow, getGoogleSheetTemplate, SOURCE_ID_HEADER, sttColumnIndex, type GoogleSheetTemplate } from "@/lib/googleSheets/template";
import { aiColumnsForTemplate, buildAiColumnFormulas, aiColumnLetters, AI_HELP_SHEET_TITLE, buildAiHelpRows, AI_FORMULA_BUFFER_ROWS, parseAiPromptOverrides, type AiPromptOverrides } from "@/lib/googleSheets/aiFormula";
import { buildRangeA1, valuesForExport, columnLetter } from "@/lib/googleSheets/spreadsheet";
import { fingerprintDbWord } from "@/lib/googleSheets/fingerprint";
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
import { syncIsPartial, type SyncRequest } from "./reliability";

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

export type CreateSheetOptions = { userId?: number; displayName?: string; aiEnrich?: boolean; aiPrompts?: AiPromptOverrides | null };

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
export async function createGoogleSheetForSet(setId: number, actor: Actor, apiOverride?: GoogleWorkspaceApi, options?: CreateSheetOptions): Promise<CreateSheetResult> {
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
  // The admin-controlled switch decides whether Lexora plants the native Sheets AI formulas.
  // Lexora itself never calls any AI API; Google Sheets owns generation.
  const aiEnrich = options?.aiEnrich !== false;
  // Admin-authored instruction text for the =AI() formulas planted below.
  const aiPrompts = options?.aiPrompts ?? null;
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
    // Plant Google Sheets' own AI formulas into the AI-enabled columns. This is
    // a Sheets-side generation capability: Lexora only inserts the instructions.
    // It never calls GEMINI_API_KEY, never posts to generativelanguage and
    // never runs fetchIpaSingle/fetchIpaBatch here. Google Sheets then generates
    // the values (with "Generate and Insert" / "Refresh and Insert" where
    // required), and the existing webhook + sync path persists them.
    if (aiEnrich) {
      try {
        // Only plant into rows BEYOND the exported vocabulary. Overwriting the
        // exported cells would replace every existing meaning/example with a
        // raw =AI() instruction and destroy the set that was just written.
        const exportedRowCount = values.length - 1;
        const bufferRows = Math.max(AI_FORMULA_BUFFER_ROWS - exportedRowCount, 0);
        await writeAiColumnFormulas(api, created.spreadsheetId, template, bufferRows, aiPrompts, exportedRowCount + 2);
      } catch (error) {
        console.warn("[google-sheets] AI formula columns skipped:", error instanceof Error ? error.message : "unknown");
      }
    }
    // The "AI điền nội dung còn thiếu" help tab. It lives in its own tab so it
    // can never be parsed as vocabulary, and it only explains Google Sheets'
    // own AI action - no Gemini key, no Lexora AI call.
    if (aiEnrich) {
      try {
        await ensureAiHelpSheet(api, created.spreadsheetId, template.templateType);
      } catch (error) {
        console.warn("[google-sheets] AI help sheet skipped:", error instanceof Error ? error.message : "unknown");
      }
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
      sourceFingerprint: fingerprintDbWord(template, word as unknown as Record<string, unknown>),
      lastSyncedFingerprint: fingerprintDbWord(template, word as unknown as Record<string, unknown>),
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
  // Extend well beyond the current data: rows added in the Sheet later get an
  // STT without any further write from the server.
  const STT_BUFFER_ROWS = 200;
  const lastRow = Math.max(rowCount + 1, STT_BUFFER_ROWS);
  const values: (string | number)[][] = [];
  for (let row = 2; row <= lastRow; row += 1) values.push([buildSttFormulaForRow(template, row)]);
  const range = `'${template.sheetTitle.replace(/'/g, "''")}'!${letter}2:${letter}${lastRow}`;
  // parseFormulas: the STT column must be stored as a real Sheets formula. With
  // the default RAW input option the "=" prefix is stored verbatim, so the sheet
  // displays the formula text instead of renumbering itself.
  await api.writeValues(spreadsheetId, range, values as never, { parseFormulas: true });
}

/**
 * Insert native Google Sheets AI formulas into the AI-enabled columns.
 *
 * STT and __lexora_id are excluded: they are system-managed display/identity
 * columns and never receive an AI formula. Each formula references its own
 * row's source cell (e.g. =AI("prompt";C2)), so Sheets fills row N from the
 * Word in row N. Materialized text, not the formula, is what sync persists.
 */
async function writeAiColumnFormulas(api: GoogleWorkspaceApi, spreadsheetId: string, template: GoogleSheetTemplate, rowCount: number, promptOverrides?: AiPromptOverrides | null, startRow: number = 2): Promise<void> {
  if (rowCount < 1) return;
  const letters = aiColumnLetters(template, template.templateType);
  if (!letters.size) return;
  for (const plan of aiColumnsForTemplate(template.templateType)) {
    const letter = letters.get(plan.key);
    if (!letter) continue;
    const formulas = buildAiColumnFormulas(template, "AI", plan, rowCount, startRow, promptOverrides);
    if (!formulas.length) continue;
    const values: (string | number)[][] = formulas.map((formula) => [formula]);
    const endRow = startRow + rowCount - 1;
    const range = `'${template.sheetTitle.replace(/'/g, "''")}'!${letter}${startRow}:${letter}${endRow}`;
    // parseFormulas: the cell must be stored as a real Sheets formula so Google
    // Sheets (not Lexora) executes it and later materializes the generated text.
    await api.writeValues(spreadsheetId, range, values as never, { parseFormulas: true });
  }
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
export async function syncConnection(connectionId: number, trigger: "manual" | "webhook" | "cron" | "initial" | "lexora", options?: { actorUserId?: number; apiOverride?: GoogleWorkspaceApi } & SyncRequest): Promise<SyncOutcome> {
  const [connection] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, connectionId)).limit(1);
  if (!connection) throw new GoogleSheetsError("Không tìm thấy kết nối Google Sheet.", "SHEET_NOT_FOUND", { retryable: false });
  if (!connection.enabled || connection.status === "disconnected") throw new GoogleSheetsError("Kết nối đang bị tạm dừng.", "INVALID_SCHEMA", { retryable: false });

  await acquireConnectionLock(connectionId, trigger);
  await db.update(googleSheetConnections).set({ status: "syncing", updatedAt: new Date() }).where(eq(googleSheetConnections.id, connectionId));
  const runId = await startSyncRun(connectionId, trigger);
  try {
    const actorUserId = connection.createdBy ?? options?.actorUserId;
    const api = options?.apiOverride ?? (actorUserId ? await apiForUser(actorUserId) : null);
    if (!api) throw new GoogleSheetsError("Thiếu tư cách xác thực Google.", "OAUTH_REQUIRED", { retryable: false });
    if (options?.repairWatch) await ensureWatchChannel(api, connection, connection.spreadsheetId);
    const grid = await readSheetGrid(connection as SyncConnection, (spreadsheetId, range) => api.readValues(spreadsheetId, range));
    const result = await db.transaction(async (tx) => {
      const outcome = await runVocabularySync(connection as SyncConnection, grid, tx, options);
      await tx.update(googleSheetSyncRuns).set({ metadata: JSON.stringify({ changes: outcome.stats.changes, conflictRows: outcome.stats.conflicts, deletionBlocked: outcome.stats.deletionBlocked }) }).where(eq(googleSheetSyncRuns.id, runId));
      return outcome;
    });
    await writeBackSourceIds(api, connection, templateFor(connection), result.stats.idWrites);
    // New rows added in the Sheet get their native Google Sheets AI formulas
    // relayed back into the Sheet. Google Sheets then generates the content;
    // Lexora never calls an AI API and never generates text itself.
    if (result.aiFormulaWrites?.length && connection.aiEnrich !== false) {
      try {
        await writeRowAiFormulas(api, connection, result.aiFormulaWrites);
      } catch (error) {
        console.warn("[google-sheets] AI formula relay skipped:", error instanceof Error ? error.message : "unknown");
      }
    }
    await finishSyncRun(runId, syncIsPartial(result.stats) ? "partial" : "success", {
      rowsRead: result.stats.rowsRead, rowsCreated: result.stats.rowsCreated, rowsUpdated: result.stats.rowsUpdated,
      rowsDeleted: result.stats.rowsDeleted, rowsUnchanged: result.stats.rowsUnchanged, rowsSkipped: result.stats.rowsSkipped,
      duplicateCount: result.stats.duplicateCount, validationErrorCount: result.stats.validationErrorCount,
      // Persist WHY rows were skipped. Without this a run can be "success" with
      // rowsSkipped=5 and the admin has no way to learn that, for example, every
      // row was missing a Meaning.
      errorMessage: result.stats.invalidRows.length
        ? `Bỏ qua ${result.stats.invalidRows.length} dòng: ` + result.stats.invalidRows.slice(0, 10).map((row) => `dòng ${row.rowNumber} ${row.message}`).join("; ")
        : undefined,
      metadata: {
        changes: result.stats.changes,
        deletionBlocked: result.stats.deletionBlocked,
        resolutions: options?.resolutions ?? [],
        conflicts: result.stats.conflicts.length, trigger,
        ...(result.stats.invalidRows.length ? { invalidRows: result.stats.invalidRows.slice(0, 25) } : {}),
        ...(result.stats.conflicts.length ? { conflictRows: result.stats.conflicts.slice(0, 25) } : {}),
        // The admin UI needs the exact word ids that changed so it can refresh
        // only the visible vocabulary rows after a webhook/manual sync.
        ...(result.stats.changedWordIds.length ? { changedWordIds: result.stats.changedWordIds } : {}),
      },
    });
    await markConnectionSyncState(connectionId, { ok: true, partial: syncIsPartial(result.stats) });
    await clearSyncPending(connectionId);
    console.log(`[google-sheet-sync] connectionId=${connectionId} trigger=${trigger} rowsCreated=${result.stats.rowsCreated} rowsUpdated=${result.stats.rowsUpdated} rowsDeleted=${result.stats.rowsDeleted} changedWordIds=[${result.stats.changedWordIds.join(",")}] webhookReceived=${trigger === "webhook"}`);
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

/**
 * Relay native Google Sheets AI formulas into the rows the Sheet just gained.
 *
 * Only the newly created rows are touched: existing rows keep whatever the
 * admin typed or Google generated, so a user edit is never replaced by a
 * formula. Nothing here calls an AI API - these are Google Sheets instructions.
 */
async function writeRowAiFormulas(api: GoogleWorkspaceApi, connection: { spreadsheetId: string; sheetTitle: string }, writes: Array<{ rowNumber: number; cells: Array<{ letter: string; formula: string }> }>): Promise<void> {
  const sheet = `'${connection.sheetTitle.replace(/'/g, "''")}'`;
  for (const write of writes) {
    for (const cell of write.cells) {
      const range = `${sheet}!${cell.letter}${write.rowNumber}:${cell.letter}${write.rowNumber}`;
      await api.writeValues(connection.spreadsheetId, range, [[cell.formula]] as never, { parseFormulas: true });
    }
  }
}

/**
 * Create the "AI điền nội dung còn thiếu" help tab (best effort).
 *
 * It lives in its own tab so it can never be parsed as vocabulary rows. It only
 * explains Google Sheets' own AI action: no Gemini key is ever requested, and
 * Lexora itself never calls an AI API.
 */
async function ensureAiHelpSheet(api: GoogleWorkspaceApi, spreadsheetId: string, templateType: string): Promise<void> {
  if (typeof api.addSheet !== "function") return;
  const meta = await api.getSpreadsheetMetadata(spreadsheetId);
  if (meta.sheets.some((sheet) => sheet.title === AI_HELP_SHEET_TITLE)) return;
  const created = await api.addSheet(spreadsheetId, AI_HELP_SHEET_TITLE);
  if (!created) return;
  const rows = buildAiHelpRows(templateType);
  const width = Math.max(1, ...rows.map((row) => row.length));
  const normalized = rows.map((row) => Array.from({ length: width }, (_cell, index) => row[index] ?? ""));
  await api.writeValues(spreadsheetId, `'${AI_HELP_SHEET_TITLE.replace(/'/g, "''")}'!A1:${String.fromCharCode(64 + Math.min(width, 26))}${normalized.length}`, normalized as never);
}

function templateFor(connection: { templateType: string; sheetTitle: string }): GoogleSheetTemplate {
  const isIrregular = connection.templateType === "irregular_verb";
  const isMandarin = connection.templateType === "language_vocab_mandarin";
  return getGoogleSheetTemplate(isIrregular ? { type: "irregular_verb", languageCode: "en" } : { type: "ielts_vocab", languageCode: isMandarin ? "zh-CN" : "en" });
}
export { SyncInProgressError };
