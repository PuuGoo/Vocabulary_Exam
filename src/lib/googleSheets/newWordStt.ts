import type { SheetsBatchValueUpdate, SheetsValue } from "./api";
import { buildSttFormulaForRow, SOURCE_ID_HEADER, STT_HEADER, type GoogleSheetTemplate } from "./template";
import { mapHeadersToFieldKeys } from "./parser";
import { columnLetter, quoteSheetTitle } from "./spreadsheet";

export function newWordSttUpdates(template: GoogleSheetTemplate, sheetTitle: string, rows: SheetsValue, sourceId: string): SheetsBatchValueUpdate[] {
  const headers = (rows[0] ?? []).map(value => String(value ?? ""));
  const columns = mapHeadersToFieldKeys(headers, template);
  const idColumn = [...columns].find(([, key]) => key === SOURCE_ID_HEADER)?.[0];
  const sttColumn = headers.findIndex(header => header.trim().toUpperCase() === STT_HEADER);
  if (idColumn === undefined || sttColumn < 0) return [];
  const matches = rows.flatMap((row, index) => index > 0 && String(row[idColumn] ?? "").trim() === sourceId ? [index] : []);
  if (matches.length !== 1) throw new Error("New word identity missing or duplicated");
  const rowIndex = matches[0];
  if (String(rows[rowIndex][sttColumn] ?? "").trim()) return [];
  const actualTemplate = { ...template, fields: headers.map((header, index) => template.fields.find(field => field.key === columns.get(index)) ?? { key: `__unmanaged_${index}`, header, width: 100, wrap: false, displayOnly: true }) };
  return [{ rangeA1: `${quoteSheetTitle(sheetTitle)}!${columnLetter(sttColumn)}${rowIndex + 1}`, values: [[buildSttFormulaForRow(actualTemplate, rowIndex + 1)]], parseFormulas: true }];
}
