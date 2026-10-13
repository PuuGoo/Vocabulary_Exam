import { isRawAiFormula } from "./parser";
import type { SheetsValue } from "./api";

/**
 * Result of scanning the FORMULA view of a Sheet for cells that still hold an
 * un-materialized Google Sheets AI instruction.
 *
 * `UNFORMATTED_VALUE` (what the sync reads) returns an empty string for those
 * cells, which makes a row look like it is missing a required field. The
 * FORMULA view is the only way to tell the three states apart reliably:
 *   - generated text  -> value present, formula absent
 *   - still generating-> raw =AI(...) formula present
 *   - genuinely empty -> neither
 */
export type AiPendingScan = {
  /** 1-based Sheet row numbers that still contain a raw AI formula. */
  rowNumbers: Set<number>;
  /** Sorted row numbers, for logging and run metadata. */
  rows: number[];
  /** Total number of cells still holding a raw AI formula. */
  cellCount: number;
  /** Pending cell count per 0-based column index. */
  cellsByColumn: Map<number, number>;
};

/**
 * Classify every cell of a FORMULA-mode read as generated / pending / empty.
 *
 * Pure and synchronous: it never calls Google, never sleeps, and never guesses
 * from a row count or a wall-clock deadline.
 */
export function scanPendingAiCells(formulas: SheetsValue | undefined): AiPendingScan {
  const rowNumbers = new Set<number>();
  const cellsByColumn = new Map<number, number>();
  let cellCount = 0;
  const matrix = Array.isArray(formulas) ? formulas : [];
  matrix.forEach((row, rowIndex) => {
    if (rowIndex === 0) return; // row 1 is the header
    (Array.isArray(row) ? row : []).forEach((cell, columnIndex) => {
      if (!isRawAiFormula(String(cell ?? ""))) return;
      rowNumbers.add(rowIndex + 1);
      cellCount += 1;
      cellsByColumn.set(columnIndex, (cellsByColumn.get(columnIndex) ?? 0) + 1);
    });
  });
  return { rowNumbers, rows: [...rowNumbers].sort((left, right) => left - right), cellCount, cellsByColumn };
}
/**
 * What the sync passes down about the AI cells it read.
 *
 * `rowNumbers` is the authoritative list of rows that still held a raw AI
 * formula when the FORMULA view was read. It is produced from the same read as
 * the value grid, so the two views can never describe different moments.
 */
export type PendingAiInput = {
  /** 1-based Sheet rows that were still generating. */
  rowNumbers?: readonly number[];
  /** Total pending cells, for logging. */
  cellCount?: number;
};

/**
 * Narrow a pending-AI snapshot to the rows that actually appear in this grid.
 *
 * Rows deleted since the read, and rows beyond the parsed grid, are dropped, so
 * a stale scan can never keep a connection permanently "pending".
 */
export function resolvePendingAiRows(
  pending: PendingAiInput | undefined,
  parsedRows: readonly { rowNumber: number }[],
): Set<number> {
  const available = new Set(parsedRows.map((row) => row.rowNumber));
  const result = new Set<number>();
  for (const rowNumber of pending?.rowNumbers ?? []) {
    if (available.has(rowNumber)) result.add(rowNumber);
  }
  return result;
}
