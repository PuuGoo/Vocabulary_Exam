import type { GoogleWorkspaceApi, SheetsBatchValueUpdate, SheetsValue } from "@/lib/googleSheets/api";
import {
  aiColumnLetters,
  aiColumnsForTemplate,
  buildAiColumnFormulas,
  type AiPromptOverrides,
} from "@/lib/googleSheets/aiFormula";
import { quoteSheetTitle } from "@/lib/googleSheets/spreadsheet";
import { isRawAiFormula } from "@/lib/googleSheets/parser";
import type { GoogleSheetTemplate } from "@/lib/googleSheets/template";

/**
 * Apply admin-authored AI prompt wording to an EXISTING Google Sheet.
 *
 * Google Sheets owns AI generation; Lexora only rewrites the native
 * =AI()/=Gemini() instruction text. No AI API is ever called from here.
 *
 * Cell states, read with valueRenderOption=FORMULA so the decision is made on
 * the real formula source and never on the formatted display text:
 *  - `=AI(...)` / `=Gemini(...)`  -> rewrite with the new prompt (the cell is
 *    provably AI-managed, so this is safe)
 *  - blank                         -> fill with the new formula, which is what
 *    an incomplete row needs in order to become usable
 *  - anything else                 -> PROTECTED. Admin-entered text and already
 *    materialized AI output look identical once Google replaces a formula with
 *    its result, and guessing provenance would silently destroy user data, so
 *    provenance is never guessed. Regenerating those cells is a separate,
 *    explicitly confirmed advanced action.
 */

export type AiPromptApplyStats = {
  updatedFormulaCells: number;
  blankCellsFilled: number;
  protectedUserCells: number;
  columnsUpdated: number;
  rowsScanned: number;
  /** Rows whose cell could not be interpreted; surfaced instead of hidden. */
  problematicRows: Array<{ rowNumber: number; column: string; reason: string }>;
};

export type AiPromptApplyResult = {
  stats: AiPromptApplyStats;
  /** Number of Google API write requests issued (batching keeps this small). */
  writeRequests: number;
};

/** Rows scanned per Google read. Keeps the FORMULA read bounded. */
const SCAN_CHUNK_ROWS = 5_000;

/** One contiguous vertical run of cells to write in a single range. */
type PendingRun = { letter: string; startRow: number; formulas: string[] };

function isBlankCell(value: unknown): boolean {
  return value == null || String(value).trim() === "";
}

/**
 * Collapse scattered row numbers into contiguous per-column runs so 981 rows
 * become a handful of ranges instead of 981 single-cell writes.
 */
function buildRuns(letters: readonly string[], pendingByRow: ReadonlyMap<number, Map<string, string>>): PendingRun[] {
  const runs: PendingRun[] = [];
  for (const letter of letters) {
    const rowNumbers = [...pendingByRow.keys()].filter((rowNumber) => pendingByRow.get(rowNumber)?.has(letter)).sort((a, b) => a - b);
    let current: PendingRun | null = null;
    for (const rowNumber of rowNumbers) {
      const formula = pendingByRow.get(rowNumber)!.get(letter)!;
      if (current && current.startRow + current.formulas.length === rowNumber) current.formulas.push(formula);
      else { current = { letter, startRow: rowNumber, formulas: [formula] }; runs.push(current); }
    }
  }
  return runs;
}

export function planAiPromptApplication(options: {
  template: GoogleSheetTemplate;
  /** Raw grid rows (row 1 = header) as read with valueRenderOption=FORMULA. */
  formulaRows: SheetsValue;
  promptOverrides: AiPromptOverrides | null;
}): { updates: SheetsBatchValueUpdate[]; stats: AiPromptApplyStats; sheetTitle: string } {
  const { template, formulaRows, promptOverrides } = options;
  const sheetTitle = quoteSheetTitle(template.sheetTitle);
  const plans = aiColumnsForTemplate(template.templateType);
  const lettersByPlan = aiColumnLetters(template, template.templateType);
  const stats: AiPromptApplyStats = { updatedFormulaCells: 0, blankCellsFilled: 0, protectedUserCells: 0, columnsUpdated: 0, rowsScanned: 0, problematicRows: [] };

  // columnIndex (0-based) drives both the letter and the grid lookup.
  const targets = plans
    .map((plan) => ({ plan, letter: lettersByPlan.get(plan.key), index: template.fields.findIndex((field) => field.key === plan.key) }))
    .filter((target): target is { plan: (typeof plans)[number]; letter: string; index: number } => !!target.letter && target.index >= 0);
  if (!targets.length) return { updates: [], stats, sheetTitle };

  // rowNumber (spreadsheet 1-based) -> columnLetter -> formula to write
  const pendingByRow = new Map<number, Map<string, string>>();
  const touchedLetters = new Set<string>();

  formulaRows.forEach((cells, rowIndex) => {
    const rowNumber = rowIndex + 2; // grid row 1 is the header
    for (const { plan, letter, index } of targets) {
      const raw = cells[index];
      if (isBlankCell(raw)) {
        // Blank AI cell: safe to receive the new prompt. This is what makes an
        // incomplete row (Word typed, Meaning still empty) usable.
        const [formula] = buildAiColumnFormulas(template, "AI", plan, 1, rowNumber, promptOverrides);
        if (!formula) { stats.problematicRows.push({ rowNumber, column: plan.key, reason: "Không tạo được công thức cho cột này." }); continue; }
        const byLetter = pendingByRow.get(rowNumber) ?? new Map<string, string>();
        byLetter.set(letter, formula);
        pendingByRow.set(rowNumber, byLetter);
        stats.blankCellsFilled += 1;
        touchedLetters.add(letter);
        continue;
      }
      const text = String(raw);
      if (isRawAiFormula(text)) {
        // Provably AI-managed: rewrite it, preserving the same source reference.
        const [formula] = buildAiColumnFormulas(template, "AI", plan, 1, rowNumber, promptOverrides);
        if (!formula) { stats.problematicRows.push({ rowNumber, column: plan.key, reason: "Không tạo được công thức cho cột này." }); continue; }
        if (formula === text) continue; // already current: nothing to write
        const byLetter = pendingByRow.get(rowNumber) ?? new Map<string, string>();
        byLetter.set(letter, formula);
        pendingByRow.set(rowNumber, byLetter);
        stats.updatedFormulaCells += 1;
        touchedLetters.add(letter);
        continue;
      }
      // Plain text: admin-entered content, or AI output Google already
      // materialized. Provenance is unknowable, so the cell is protected.
      stats.protectedUserCells += 1;
    }
    stats.rowsScanned = Math.max(stats.rowsScanned, rowNumber - 1);
  });

  const runs = buildRuns([...touchedLetters], pendingByRow);
  const updates: SheetsBatchValueUpdate[] = runs.map((run) => ({
    rangeA1: `${sheetTitle}!${run.letter}${run.startRow}:${run.letter}${run.startRow + run.formulas.length - 1}`,
    values: run.formulas.map((formula) => [formula]),
    parseFormulas: true,
  }));
  stats.columnsUpdated = touchedLetters.size;
  return { updates, stats, sheetTitle };
}

/**
 * Read the Sheet with valueRenderOption=FORMULA and rewrite the AI formulas.
 *
 * Batching: every contiguous run becomes one entry in a single
 * values.batchUpdate request, so a 981-row sheet costs a handful of API calls
 * instead of one per cell. Degrades to per-range writeValues when the API
 * object has no batchWriteValues.
 */
export async function applyAiPromptsToSheet(options: {
  api: GoogleWorkspaceApi;
  spreadsheetId: string;
  template: GoogleSheetTemplate;
  promptOverrides: AiPromptOverrides | null;
}): Promise<AiPromptApplyResult> {
  const { api, spreadsheetId, template, promptOverrides } = options;
  const sheetTitle = quoteSheetTitle(template.sheetTitle);
  // Read enough rows to cover the sheet body; FORMULA gives the real source.
  const scanRange = `${sheetTitle}!A1:${String.fromCharCode(64 + Math.min(template.fields.length, 26))}${SCAN_CHUNK_ROWS + 1}`;
  const formulaRows = await api.readValues(spreadsheetId, scanRange, { renderOption: "FORMULA" });

  const { updates, stats } = planAiPromptApplication({ template, formulaRows, promptOverrides });
  let writeRequests = 0;
  if (updates.length) {
    if (typeof api.batchWriteValues === "function") {
      // Chunk to stay well under the request-payload limit on large sheets.
      for (let offset = 0; offset < updates.length; offset += 100) {
        await api.batchWriteValues(spreadsheetId, updates.slice(offset, offset + 100));
        writeRequests += 1;
      }
    } else {
      for (const update of updates) {
        await api.writeValues(spreadsheetId, update.rangeA1, update.values, { parseFormulas: true });
        writeRequests += 1;
      }
    }
  }
  return { stats, writeRequests };
}
