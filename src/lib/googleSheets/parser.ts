import { SOURCE_ID_HEADER, type GoogleSheetTemplate } from "@/lib/googleSheets/template";

export type SheetGrid = { headers: string[]; rows: string[][] };

/** Column index (0-based) for a canonical template field, tolerating reordered columns. */
export function mapHeadersToFieldKeys(headers: readonly string[], template: GoogleSheetTemplate): Map<number, string> {
  const mapping = new Map<number, string>();
  const normalizedHeaders = headers.map((header) => normalizeHeader(header));
  template.fields.forEach((field) => {
    const normalizedField = normalizeHeader(field.header);
    const index = normalizedHeaders.findIndex((header) => header === normalizedField);
    if (index >= 0) mapping.set(index, field.key);
  });
  return mapping;
}

function normalizeHeader(header: string): string {
  return header.normalize("NFC").trim().toLocaleLowerCase("vi").replace(/\s+/g, " ");
}

/** Row 1 is the header; every subsequent row is keyed by canonical field. */
export function parseSheetGrid(grid: SheetGrid, template: GoogleSheetTemplate): Array<{ rowNumber: number; sourceId: string; values: Record<string, string> }> {
  const fieldByColumn = mapHeadersToFieldKeys(grid.headers, template);
  if (!fieldByColumn.has(0) || !fieldByColumn.has(1)) {
    throw new Error("Header không khớp template của Lexora.");
  }
  const results: Array<{ rowNumber: number; sourceId: string; values: Record<string, string> }> = [];
  grid.rows.forEach((cells, rowIndex) => {
    const rowNumber = rowIndex + 2;
    const values: Record<string, string> = {};
    let sourceId = "";
    fieldByColumn.forEach((key, columnIndex) => {
      const raw = cells[columnIndex] ?? "";
      if (key === SOURCE_ID_HEADER) sourceId = String(raw ?? "").trim();
      else values[key] = String(raw ?? "");
    });
    results.push({ rowNumber, sourceId, values });
  });
  return results;
}

export function gridFromValuesRange(values: (string | number | boolean | null)[][] | undefined): SheetGrid {
  const matrix = Array.isArray(values) ? values : [];
  const headers = (matrix[0] || []).map((cell) => String(cell ?? ""));
  const rows = matrix.slice(1).map((row) => row.map((cell) => String(cell ?? "")));
  return { headers, rows };
}
