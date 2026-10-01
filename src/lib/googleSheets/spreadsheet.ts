import { SOURCE_ID_HEADER, type GoogleSheetTemplate } from "@/lib/googleSheets/template";

/** Accept only a full docs.google.com spreadsheet URL and extract its id. */
export function parseSpreadsheetUrl(input: string): string | null {
  const trimmed = String(input ?? "").trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^https?:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]{10,})(?:\/|#|$)/i);
  return match?.[1] ?? null;
}

export function columnLetter(index: number): string {
  let current = index + 1;
  let result = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}

export function quoteSheetTitle(sheetTitle: string): string {
  return `'${sheetTitle.replace(/'/g, "''")}'`;
}

export function buildRangeA1(sheetTitle: string, fieldCount: number, rowCount: number): string {
  return `${quoteSheetTitle(sheetTitle)}!A1:${columnLetter(fieldCount - 1)}${Math.max(1, rowCount + 1)}`;
}

/** Rows 2..rowCount+1 of a single source-id column (used to write IDs back). */
export function buildColumnRangeA1(sheetTitle: string, columnIndex: number, rowCount: number): string {
  const column = columnLetter(columnIndex);
  return `${quoteSheetTitle(sheetTitle)}!${column}2:${column}${Math.max(2, rowCount + 1)}`;
}

export function templateHeaders(template: GoogleSheetTemplate): string[] {
  return template.fields.map((field) => field.header);
}

export type SheetExportRow = { sourceId: string; values: Record<string, string> };

export function valuesForExport(template: GoogleSheetTemplate, rows: readonly SheetExportRow[]): (string | number)[][] {
  const headerRow = templateHeaders(template);
  const dataRows = rows.map((row) =>
    template.fields.map((field) => {
      if (field.key === SOURCE_ID_HEADER) return row.sourceId;
      const value = row.values[field.key];
      return value == null ? "" : value;
    }),
  );
  return [headerRow, ...dataRows];
}
