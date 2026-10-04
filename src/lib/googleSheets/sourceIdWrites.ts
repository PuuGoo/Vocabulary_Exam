import type { SheetsBatchValueUpdate } from "./api";
import { columnLetter, quoteSheetTitle } from "./spreadsheet";
import { mapHeadersToFieldKeys, type SheetGrid } from "./parser";
import { SOURCE_ID_HEADER, type GoogleSheetTemplate } from "./template";
import { GoogleSheetsError } from "./errors";

export function verifiedSourceIdWriteRanges(sheetTitle: string, template: GoogleSheetTemplate, original: SheetGrid, current: SheetGrid, writes: ReadonlyArray<{ rowNumber: number; sourceId: string }>): SheetsBatchValueUpdate[] {
  if (!writes.length) return [];
  const idColumn = [...mapHeadersToFieldKeys(current.headers, template)].find(([, field]) => field === SOURCE_ID_HEADER)?.[0];
  const width = Math.max(original.headers.length, current.headers.length);
  const height = Math.max(original.rows.length, current.rows.length);
  const sameCells = (left: readonly string[], right: readonly string[]) => Array.from({ length: width }, (_, index) => String(left[index] ?? "") === String(right[index] ?? "")).every(Boolean);
  if (idColumn === undefined || !sameCells(original.headers, current.headers) || Array.from({ length: height }, (_, index) => !sameCells(original.rows[index] ?? [], current.rows[index] ?? [])).some(Boolean)) {
    throw new GoogleSheetsError("Sheet đã thay đổi trong lúc đồng bộ. Lexora sẽ đọc lại trước khi ghi ID.", "INVALID_SCHEMA", { retryable: true });
  }
  for (const write of writes) {
    const existing = current.rows[write.rowNumber - 2]?.[idColumn]?.trim();
    if (existing && existing !== write.sourceId) throw new GoogleSheetsError("ID trên Sheet đã thay đổi. Không ghi đè ID hiện tại.", "INVALID_SCHEMA", { retryable: true });
  }
  return sourceIdWriteRanges(sheetTitle, columnLetter(idColumn), writes);
}

export function sourceIdWriteRanges(sheetTitle: string, column: string, writes: ReadonlyArray<{ rowNumber: number; sourceId: string }>): SheetsBatchValueUpdate[] {
  const sorted = [...writes].sort((left, right) => left.rowNumber - right.rowNumber);
  const batches: SheetsBatchValueUpdate[] = [];
  let current: SheetsBatchValueUpdate | undefined;
  let previousRow = -1;
  for (const write of sorted) {
    if (!Number.isSafeInteger(write.rowNumber) || write.rowNumber < 2 || write.rowNumber === previousRow) throw new Error("Invalid source ID write row");
    if (!current || write.rowNumber !== previousRow + 1) {
      current = { rangeA1: `${quoteSheetTitle(sheetTitle)}!${column}${write.rowNumber}`, values: [], parseFormulas: false };
      batches.push(current);
    }
    current.values.push([write.sourceId]);
    previousRow = write.rowNumber;
  }
  return batches;
}
