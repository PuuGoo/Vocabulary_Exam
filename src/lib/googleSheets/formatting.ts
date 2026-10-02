import type { GoogleWorkspaceApi } from "@/lib/googleSheets/api";
import type { GoogleSheetTemplate } from "@/lib/googleSheets/template";
import { columnLetter, quoteSheetTitle } from "@/lib/googleSheets/spreadsheet";

export type SheetsApiPort = GoogleWorkspaceApi & { batchUpdate?: (spreadsheetId: string, requests: Record<string, unknown>[]) => Promise<void> };

/**
 * Configure header formatting, freeze row 1, column widths, text wrapping and a
 * basic filter. Uses Google Sheets `spreadsheets.batchUpdate` when the port
 * supports it; otherwise degrades gracefully so a spreadsheet is never left
 * half-created because of cosmetic formatting.
 */
export async function configureSheetLayout(api: SheetsApiPort, options: { spreadsheetId: string; sheetId: number; template: GoogleSheetTemplate; rowCount: number }) {
  if (typeof api.batchUpdate !== "function") return;
  const { spreadsheetId, sheetId, template, rowCount } = options;
  const lastRow = Math.max(2, rowCount + 1);
  const requests: Record<string, unknown>[] = [
    { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
    { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: template.fields.length }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.94, green: 0.93, blue: 0.98 }, wrapStrategy: "WRAP" } }, fields: "userEnteredFormat(textFormat,backgroundColor,wrapStrategy)" } },
  ];
  template.fields.forEach((field, index) => {
    requests.push({ updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: index, endIndex: index + 1 }, properties: { pixelSize: field.width }, fields: "pixelSize" } });
    if (field.wrap) requests.push({ repeatCell: { range: { sheetId, startColumnIndex: index, endColumnIndex: index + 1 }, cell: { userEnteredFormat: { wrapStrategy: "WRAP" } }, fields: "userEnteredFormat.wrapStrategy" } });
    if (field.text) requests.push({ repeatCell: { range: { sheetId, startColumnIndex: index, endColumnIndex: index + 1 }, cell: { userEnteredFormat: { numberFormat: { type: "TEXT" } } }, fields: "userEnteredFormat.numberFormat" } });
    if (field.displayOnly) {
      // STT is a narrow, centered, non-wrapping display column: readable at a
      // glance without ever becoming vocabulary data.
      requests.push({ repeatCell: { range: { sheetId, startColumnIndex: index, endColumnIndex: index + 1 }, cell: { userEnteredFormat: { horizontalAlignment: "CENTER", wrapStrategy: "OVERFLOW", numberFormat: { type: "NUMBER", pattern: "0" } } }, fields: "userEnteredFormat(horizontalAlignment,wrapStrategy,numberFormat)" } });
    }
  });
  requests.push({ setBasicFilter: { filter: { range: { sheetId, startRowIndex: 0, endRowIndex: lastRow, startColumnIndex: 0, endColumnIndex: template.fields.length } } } });
  await api.batchUpdate(spreadsheetId, requests);
}

export function sourceIdColumnIndex(template: GoogleSheetTemplate): number {
  return Math.max(0, template.fields.findIndex((field) => field.key === "__lexora_id"));
}

export function sourceIdColumnLetter(template: GoogleSheetTemplate): string {
  return columnLetter(sourceIdColumnIndex(template));
}

export function quotedSheetRange(template: GoogleSheetTemplate, fromRow: number, toRow: number): string {
  return `${quoteSheetTitle(template.sheetTitle)}!${sourceIdColumnLetter(template)}${fromRow}:${sourceIdColumnLetter(template)}${toRow}`;
}
