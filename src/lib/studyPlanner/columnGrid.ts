import { columnLetter, quoteSheetTitle } from "@/lib/googleSheets/spreadsheet";

import { readOptionalCell } from "@/lib/studyPlanner/values";

/**
 * Phase 4b: column-letter grid reader for the owner workbook.
 *
 * Unlike vocabulary (header row + named fields), planner tabs are addressed by
 * tab title + column letter + absolute row number (Phase 1.4 map). This module
 * turns raw Sheets values into position-addressed rows so per-domain importers
 * can normalize them, and builds the matching write ranges for __lexora_id
 * backfill and web -> Sheet writes.
 *
 * A blank row (every source cell cleared) is a real signal, not an error: the
 * domain importer decides whether it is a delete candidate. A missing grid
 * (undefined values from a failed read) yields no rows and must never be turned
 * into deletes.
 */

export type PlannerGridRow = {
  /** 1-based sheet row number (bookkeeping only, never identity). */
  rowNumber: number;
  /** Raw cell text per column letter, e.g. { A: "x", B: null }. */
  cells: Record<string, string | null | undefined>;
};

export type PlannerGrid = {
  tab: string;
  rows: PlannerGridRow[];
};

/** Last row (1-based) of the data range, or null when unbounded. */
export function rangeLastRow(dataFrom: number, dataTo: number | null): number | null {
  if (dataTo == null) return null;
  return Math.max(dataFrom, dataTo);
}

/**
 * Slice a full-tab values matrix into position rows. `columns` are the
 * source + control + metadata letters from the workbook map; derived columns
 * are never read here.
 */
export function gridFromPlannerValues(options: {
  tab: string;
  values: (string | number | boolean | null)[][] | undefined;
  dataFrom: number;
  dataTo: number | null;
  columns: readonly string[];
}): PlannerGrid {
  const matrix = Array.isArray(options.values) ? options.values : [];
  const last = rangeLastRow(options.dataFrom, options.dataTo);
  const end = last == null ? options.dataFrom + Math.max(0, matrix.length - options.dataFrom) : last;
  const rows: PlannerGridRow[] = [];
  for (let rowNumber = options.dataFrom; rowNumber <= end; rowNumber += 1) {
    const matrixRow = matrix[rowNumber - 1] ?? [];
    const cells: Record<string, string | null | undefined> = {};
    for (const letter of options.columns) {
      cells[letter] = readOptionalCell(matrixRow[columnIndexFromLetter(letter)]);
    }
    rows.push({ rowNumber, cells });
  }
  return { tab: options.tab, rows };
}

export function columnIndexFromLetter(letters: string): number {
  let index = 0;
  for (const character of letters.toUpperCase()) {
    const code = character.charCodeAt(0) - 64;
    if (code < 1 || code > 26) throw new Error(`Invalid column letter: ${letters}`);
    index = index * 26 + code;
  }
  return index - 1;
}

/** A1 range covering one metadata cell, e.g. 'Tab'!AP7 for row 7. */
export function metadataCellRange(tab: string, column: string, rowNumber: number): string {
  if (!Number.isSafeInteger(rowNumber) || rowNumber < 1) throw new Error("Invalid metadata row");
  return `${quoteSheetTitle(tab)}!${column}${rowNumber}`;
}

/** Contiguous __lexora_id backfill writes merged into single-range updates. */
export function metadataWriteRanges(
  tab: string,
  column: string,
  writes: ReadonlyArray<{ rowNumber: number; sourceId: string }>,
): Array<{ rangeA1: string; values: (string | number | boolean | null)[][] }> {
  const sorted = [...writes].sort((left, right) => left.rowNumber - right.rowNumber);
  const batches: Array<{ rangeA1: string; values: (string | number | boolean | null)[][] }> = [];
  let current: { rangeA1: string; values: (string | number | boolean | null)[][] } | undefined;
  let previousRow = -1;
  for (const write of sorted) {
    if (!Number.isSafeInteger(write.rowNumber) || write.rowNumber < 1 || write.rowNumber === previousRow) {
      throw new Error("Invalid planner metadata write row");
    }
    if (!current || write.rowNumber !== previousRow + 1) {
      current = { rangeA1: `${quoteSheetTitle(tab)}!${column}${write.rowNumber}`, values: [] };
      batches.push(current);
    }
    current.values.push([write.sourceId]);
    previousRow = write.rowNumber;
  }
  return batches;
}

/** Read range for one source tab; callers batch these into one API request. */
export function plannerTabReadRange(tab: string, lastColumn: string, dataFrom: number, dataTo: number | null): string {
  const last = dataTo == null ? dataFrom + 2000 : dataTo;
  return `${quoteSheetTitle(tab)}!A1:${lastColumn}${Math.max(dataFrom, last)}`;
}

export { columnLetter };
