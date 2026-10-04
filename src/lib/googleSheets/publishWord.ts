import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { googleSheetConnections, googleSheetRowMappings, vocabSets, words } from "@/db/schema";
import { apiForUser, exportValuesForWord } from "./sheetLifecycle";
import { acquireConnectionLock, releaseConnectionLock } from "./store";
import { getGoogleSheetTemplate, SOURCE_ID_HEADER } from "./template";
import { mapHeadersToFieldKeys } from "./parser";
import { columnLetter, quoteSheetTitle } from "./spreadsheet";
import { fingerprintDbWord } from "./fingerprint";
import { resolveConnectedTab } from "./tabIdentity";
import type { GoogleWorkspaceApi } from "./api";
import { firstTemplateBufferRow } from "./newWordRow";

export async function publishCreatedWord(word: typeof words.$inferSelect, apiOverride?: GoogleWorkspaceApi) {
  const [connection] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.setId, word.setId)).limit(1);
  if (!connection?.enabled || connection.status !== "connected") return { status: "not_connected" as const };
  let locked = false;
  try {
    await acquireConnectionLock(connection.id, "lexora");
    locked = true;
    const [current] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, connection.id));
    if (!current?.enabled || current.status !== "connected" || current.spreadsheetId !== connection.spreadsheetId) throw new Error("Connection changed");
    const [mapped] = await db.select().from(googleSheetRowMappings).where(and(eq(googleSheetRowMappings.connectionId, connection.id), eq(googleSheetRowMappings.wordId, word.id))).limit(1);
    if (mapped) return { status: "synced" as const };
    const [set] = await db.select().from(vocabSets).where(eq(vocabSets.id, word.setId));
    if (!set || !connection.createdBy) throw new Error("Missing Google owner");
    const api = apiOverride ?? await apiForUser(connection.createdBy);
    const tab = resolveConnectedTab(await api.getSpreadsheetMetadata(connection.spreadsheetId), connection.sheetId);
    const template = getGoogleSheetTemplate(set);
    const range = `${quoteSheetTitle(tab.title)}!A:${columnLetter((tab.columnCount ?? template.fields.length) - 1)}`;
    const existing = await api.readValues(connection.spreadsheetId, range, { renderOption: "FORMULA" });
    const headers = (existing[0] ?? []).map(value => String(value ?? ""));
    const fields = mapHeadersToFieldKeys(headers, template);
    const idColumn = [...fields].find(([, key]) => key === SOURCE_ID_HEADER)?.[0];
    if (idColumn === undefined || template.fields.some(field => !field.displayOnly && ![...fields.values()].includes(field.key))) throw new Error("Sheet headers need repair");
    const sourceId = `v_${createHash("sha256").update(`${connection.id}:${word.id}`).digest("hex").slice(0, 16)}`;
    const existingIndex = existing.findIndex((row, index) => index > 0 && row[idColumn] === sourceId);
    let rowNumber = existingIndex + 1;
    if (existingIndex < 0) {
      const values = exportValuesForWord(template, word);
      const row = headers.map((_, index) => fields.get(index) === SOURCE_ID_HEADER ? sourceId : values[fields.get(index) ?? ""] ?? "");
      const bufferRow = firstTemplateBufferRow(existing, headers);
      if (bufferRow !== null) {
        const currentRows = await api.readValues(connection.spreadsheetId, range, { renderOption: "FORMULA" });
        if (JSON.stringify(currentRows) !== JSON.stringify(existing)) throw new Error("Sheet changed before insertion");
        await api.batchUpdate(connection.spreadsheetId, [{ insertDimension: { range: { sheetId: tab.sheetId, dimension: "ROWS", startIndex: bufferRow - 1, endIndex: bufferRow }, inheritFromBefore: false } }]);
        await api.writeValues(connection.spreadsheetId, `${quoteSheetTitle(tab.title)}!A${bufferRow}`, [row]);
        rowNumber = bufferRow;
      } else {
        if (!api.appendValues) throw new Error("Google append is unavailable");
        rowNumber = await api.appendValues(connection.spreadsheetId, range, [row]);
      }
    }
    const fingerprint = fingerprintDbWord(template, word);
    await db.insert(googleSheetRowMappings).values({ connectionId: connection.id, wordId: word.id, sourceId, sheetRowNumber: rowNumber, sourceFingerprint: fingerprint, lastSyncedFingerprint: fingerprint });
    return { status: "synced" as const };
  } catch {
    return { status: "error" as const, warning: "Từ đã lưu trên web nhưng chưa xác nhận ghi sang Google Sheet. Kiểm tra kết nối trước khi thử lại; không tạo lại từ." };
  } finally {
    if (locked) await releaseConnectionLock(connection.id);
  }
}
