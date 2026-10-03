import { SOURCE_ID_HEADER, STT_FIELD_KEY, type GoogleSheetTemplate } from "@/lib/googleSheets/template";

export type SheetGrid = { headers: string[]; rows: string[][] };

/** Column index (0-based) for a canonical template field, tolerating reordered columns. */
export function mapHeadersToFieldKeys(headers: readonly string[], template: GoogleSheetTemplate): Map<number, string> {
  const mapping = new Map<number, string>();
  const normalizedHeaders = headers.map((header) => normalizeHeader(header));
  template.fields.forEach((field) => {
    // STT is presentation only: it is deliberately not mapped, so it can never
    // reach the vocabulary import model, the fingerprint or the database.
    if (field.displayOnly) return;
    const normalizedField = normalizeHeader(field.header);
    const index = normalizedHeaders.findIndex((header) => header === normalizedField);
    if (index >= 0) mapping.set(index, field.key);
  });
  return mapping;
}

/**
 * A cell that is still a raw AI instruction (not yet generated text).
 *
 * Google Sheets' =AI()/=Gemini() cells return their generated value once the
 * admin uses the supported "Generate and Insert" / "Refresh and Insert" action.
 * Until then the cell still reads as formula source. Lexora must never persist
 * that instruction as vocabulary text, and must never treat it as a user edit.
 */
export function isRawAiFormula(value: string): boolean {
  const text = value.trim();
  if (!text.startsWith("=")) return false;
  return /^=(AI|Gemini)\(/i.test(text);
}

/** Strip a leading "=" only when the cell is an un-materialized AI formula. */
export function readGeneratedValue(value: string): string {
  return isRawAiFormula(value) ? "" : value;
}

function normalizeHeader(header: string): string {
  return header.normalize("NFC").trim().toLocaleLowerCase("vi").replace(/\s+/g, " ");
}

/** Row 1 is the header; every subsequent row is keyed by canonical field. */
export function parseSheetGrid(grid: SheetGrid, template: GoogleSheetTemplate): Array<{ rowNumber: number; sourceId: string; values: Record<string, string> }> {
  const fieldByColumn = mapHeadersToFieldKeys(grid.headers, template);
  // The sheet may (or may not) carry a display-only STT column at A; identity
  // only cares that __lexora_id is present somewhere in the header row.
  const mappedKeys = new Set(fieldByColumn.values());
  if (!mappedKeys.has(SOURCE_ID_HEADER)) {
    throw new Error("Header không khớp template của Lexora.");
  }
  const results: Array<{ rowNumber: number; sourceId: string; values: Record<string, string> }> = [];
  grid.rows.forEach((cells, rowIndex) => {
    const rowNumber = rowIndex + 2;
    const values: Record<string, string> = {};
    let sourceId = "";
    fieldByColumn.forEach((key, columnIndex) => {
      if (key === STT_FIELD_KEY) return; // never enters the values map
      const raw = cells[columnIndex] ?? "";
      if (key === SOURCE_ID_HEADER) sourceId = String(raw ?? "").trim();
      // Never persist an un-materialized AI formula as vocabulary text.
      else values[key] = readGeneratedValue(String(raw ?? ""));
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
