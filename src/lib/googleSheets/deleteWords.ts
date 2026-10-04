import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { googleSheetConnections, googleSheetRowMappings, vocabSets, words } from "@/db/schema";
import { deleteWordsAndNormalize } from "@/lib/wordOrder.server";
import { apiForUser } from "./sheetLifecycle";
import { acquireConnectionLock, releaseConnectionLock } from "./store";
import { resolveConnectedTab } from "./tabIdentity";
import { getGoogleSheetTemplate, SOURCE_ID_HEADER } from "./template";
import { mapHeadersToFieldKeys } from "./parser";
import { quoteSheetTitle, columnLetter } from "./spreadsheet";
import { GoogleSheetsError } from "./errors";
import type { GoogleWorkspaceApi } from "./api";

export async function deleteWordsWithSheetSync(ids: readonly number[], apiOverride?: GoogleWorkspaceApi) {
  const selected = await db.select({ setId: words.setId }).from(words).where(inArray(words.id, [...ids]));
  if (selected.length !== ids.length) return { kind: "stale" as const, deleted: 0 };
  const connections = await db.select().from(googleSheetConnections).where(inArray(googleSheetConnections.setId, selected.map(word => word.setId))).orderBy(asc(googleSheetConnections.id));
  const locked: number[] = [];
  try {
    for (const connection of connections) {
      await acquireConnectionLock(connection.id, "delete_words");
      locked.push(connection.id);
    }
    return await deleteWordsAndNormalize(ids, async tx => {
      for (const original of connections) {
        const [connection] = await tx.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, original.id));
        if (!connection || ["disconnected", "archived", "replaced", "missing"].includes(connection.status)) continue;
        const mappings = await tx.select().from(googleSheetRowMappings).where(and(eq(googleSheetRowMappings.connectionId, connection.id), inArray(googleSheetRowMappings.wordId, [...ids])));
        if (!mappings.length) continue;
        if (!connection.createdBy) throw new GoogleSheetsError("Kết nối Google không có chủ sở hữu. Chưa xóa từ.", "OAUTH_REQUIRED");
        const api = apiOverride ?? await apiForUser(connection.createdBy);
        const tab = resolveConnectedTab(await api.getSpreadsheetMetadata(connection.spreadsheetId), connection.sheetId);
        const [set] = await tx.select().from(vocabSets).where(eq(vocabSets.id, connection.setId));
        const template = getGoogleSheetTemplate(set);
        const range = `${quoteSheetTitle(tab.title)}!A:${columnLetter((tab.columnCount ?? template.fields.length) - 1)}`;
        const rows = await api.readValues(connection.spreadsheetId, range, { renderOption: "FORMULA" });
        const fields = mapHeadersToFieldKeys((rows[0] ?? []).map(value => String(value ?? "")), template);
        const idColumn = [...fields].find(([, key]) => key === SOURCE_ID_HEADER)?.[0];
        if (idColumn === undefined) throw new GoogleSheetsError("Sheet thiếu cột ID. Hãy sửa Sheet trước khi xóa từ.", "INVALID_SCHEMA", { status: 409 });
        const sourceIds = new Set(mappings.map(mapping => mapping.sourceId));
        const targets = rows.flatMap((row, index) => index > 0 && sourceIds.has(String(row[idColumn] ?? "").trim()) ? [index] : []);
        const seen = new Set<string>();
        for (const index of targets) {
          const sourceId = String(rows[index][idColumn]).trim();
          if (seen.has(sourceId)) throw new GoogleSheetsError("Sheet có ID trùng. Chưa xóa từ; hãy sửa ID trước.", "INVALID_SCHEMA", { status: 409 });
          seen.add(sourceId);
        }
        if (!targets.length) continue;
        const current = await api.readValues(connection.spreadsheetId, range, { renderOption: "FORMULA" });
        if (JSON.stringify(current) !== JSON.stringify(rows)) throw new GoogleSheetsError("Sheet vừa thay đổi. Hãy thử xóa lại.", "INVALID_SCHEMA", { status: 409 });
        await api.batchUpdate(connection.spreadsheetId, targets.sort((left, right) => right - left).map(index => ({ deleteDimension: { range: { sheetId: tab.sheetId, dimension: "ROWS", startIndex: index, endIndex: index + 1 } } })));
        const after = await api.readValues(connection.spreadsheetId, range);
        if (after.slice(1).some(row => sourceIds.has(String(row[idColumn] ?? "").trim()))) throw new GoogleSheetsError("Chưa xác nhận xóa trên Sheet. Từ trên web được giữ lại; hãy thử lại.", "NETWORK");
      }
    });
  } finally {
    for (const connectionId of locked.reverse()) await releaseConnectionLock(connectionId);
  }
}

export function sheetWordDeletionError(error: unknown) {
  const busy = error instanceof Error && error.name === "SyncInProgressError";
  return Response.json({ error: busy ? "Đang đồng bộ Google Sheet. Vui lòng thử xóa lại sau vài giây." : "Chưa thể hoàn tất xóa từ trên Google Sheet. Từ trên web được giữ lại; hãy kiểm tra kết nối rồi thử lại." }, { status: busy ? 409 : error instanceof GoogleSheetsError ? error.status ?? 502 : 502 });
}
