import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { googleSheetConnections, googleSheetRowMappings, googleSheetSyncPending, vocabSets, words } from "@/db/schema";
import { lockVocabularySets } from "@/lib/wordOrder.server";
import { apiForUser } from "./sheetLifecycle";
import { acquireConnectionLock, releaseConnectionLock } from "./store";
import { GoogleSheetsError } from "./errors";
import { getGoogleSheetTemplate, SOURCE_ID_HEADER } from "./template";
import { gridFromValuesRange, mapHeadersToFieldKeys, parseSheetGrid } from "./parser";
import { fingerprintDbWord, fingerprintSheetValues } from "./fingerprint";
import { columnLetter, quoteSheetTitle } from "./spreadsheet";
import { resolveConnectedTab } from "./tabIdentity";
import { runPendingConnection } from "./reconcile";
import type { GoogleWorkspaceApi } from "./api";

export async function editWordWithSheetSync(wordId: number, patch: Record<string, string>, apiOverride?: GoogleWorkspaceApi) {
  const [original] = await db.select().from(words).where(eq(words.id, wordId));
  if (!original) throw new GoogleSheetsError("Không tìm thấy từ.", "INVALID_SCHEMA", { status: 404 });
  const [connection] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.setId, original.setId)).limit(1);
  let locked = false;
  try {
    if (connection) { await acquireConnectionLock(connection.id, "edit_word"); locked = true; }
    return await db.transaction(async tx => {
      await lockVocabularySets(tx, [original.setId]);
      const [before] = await tx.select().from(words).where(eq(words.id, wordId)).for("update");
      if (!before || before.setId !== original.setId) throw new GoogleSheetsError("Từ đã thay đổi. Hãy tải lại.", "INVALID_SCHEMA", { status: 409 });
      const changed = Object.fromEntries(Object.entries(patch).filter(([key, value]) => String((before as Record<string, unknown>)[key] ?? "") !== value));
      if (!Object.keys(changed).length) return before;
      const [active] = connection ? await tx.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, connection.id)) : [];
      if (active?.enabled && ["connected", "syncing"].includes(active.status)) {
        const [mapping] = await tx.select().from(googleSheetRowMappings).where(and(eq(googleSheetRowMappings.connectionId, active.id), eq(googleSheetRowMappings.wordId, wordId)));
        if (!mapping || mapping.deletedAt || !active.createdBy) throw new GoogleSheetsError("Từ chưa có dòng Sheet hoạt động. Hãy kiểm tra kết nối trước khi sửa.", "INVALID_SCHEMA", { status: 409 });
        const [set] = await tx.select().from(vocabSets).where(eq(vocabSets.id, original.setId));
        const template = getGoogleSheetTemplate(set);
        const api = apiOverride ?? await apiForUser(active.createdBy);
        const tab = resolveConnectedTab(await api.getSpreadsheetMetadata(active.spreadsheetId), active.sheetId);
        const range = `${quoteSheetTitle(tab.title)}!A:${columnLetter((tab.columnCount ?? template.fields.length) - 1)}`;
        const rows = await api.readValues(active.spreadsheetId, range);
        const grid = gridFromValuesRange(rows);
        const matches = parseSheetGrid(grid, template).filter(row => row.sourceId === mapping.sourceId);
        if (matches.length !== 1) throw new GoogleSheetsError("Không xác định được dòng Sheet duy nhất. Chưa lưu thay đổi.", "INVALID_SCHEMA", { status: 409 });
        const row = matches[0];
        const sheetFingerprint = fingerprintSheetValues(template, row.values);
        if (sheetFingerprint !== fingerprintDbWord(template, before)) throw new GoogleSheetsError("Sheet có thay đổi chưa đồng bộ. Hãy đồng bộ và kiểm tra lại trước khi sửa trên web.", "INVALID_SCHEMA", { status: 409 });
        const columns = mapHeadersToFieldKeys(grid.headers, template);
        const updates = Object.entries(changed).flatMap(([key, value]) => {
          if (key === SOURCE_ID_HEADER || !template.fields.some(field => !field.displayOnly && field.key === key)) return [];
          const column = [...columns].find(([, field]) => field === key)?.[0];
          if (column === undefined) throw new GoogleSheetsError(`Sheet thiếu cột ${key}.`, "INVALID_SCHEMA", { status: 409 });
          return [{ rangeA1: `${quoteSheetTitle(tab.title)}!${columnLetter(column)}${row.rowNumber}`, values: [[value]], parseFormulas: false }];
        });
        if (updates.length) {
          const current = await api.readValues(active.spreadsheetId, range);
          if (JSON.stringify(current) !== JSON.stringify(rows)) throw new GoogleSheetsError("Sheet vừa thay đổi. Hãy thử lại.", "INVALID_SCHEMA", { status: 409 });
          if (api.batchWriteValues) await api.batchWriteValues(active.spreadsheetId, updates);
          else for (const update of updates) await api.writeValues(active.spreadsheetId, update.rangeA1, update.values, { parseFormulas: false });
          const fingerprint = fingerprintDbWord(template, { ...before, ...changed });
          const confirmed = parseSheetGrid(gridFromValuesRange(await api.readValues(active.spreadsheetId, range)), template).filter(item => item.sourceId === mapping.sourceId);
          if (confirmed.length !== 1 || fingerprintSheetValues(template, confirmed[0].values) !== fingerprint) throw new GoogleSheetsError("Sheet thay đổi trong lúc lưu. Hãy đồng bộ và kiểm tra lại.", "INVALID_SCHEMA", { status: 409 });
          await tx.update(googleSheetRowMappings).set({ sourceFingerprint: fingerprint, lastSyncedFingerprint: fingerprint, sheetRowNumber: row.rowNumber, updatedAt: new Date() }).where(eq(googleSheetRowMappings.id, mapping.id));
        }
      } else if (active && active.status === "error" && active.enabled) {
        throw new GoogleSheetsError("Kết nối Sheet đang lỗi. Hãy khắc phục trước khi sửa từ.", "INVALID_SCHEMA", { status: 409 });
      }
      const [updated] = await tx.update(words).set(changed).where(eq(words.id, wordId)).returning();
      return updated;
    });
  } finally {
    if (locked && connection) {
      await releaseConnectionLock(connection.id);
      if (!apiOverride) {
        try {
          const [pending] = await db.select().from(googleSheetSyncPending).where(eq(googleSheetSyncPending.connectionId, connection.id));
          if (pending?.pending) await runPendingConnection(connection.id, "webhook");
        } catch { }
      }
    }
  }
}
