import type { SheetsBatchValueUpdate, SheetsValue } from "./api";
import { quoteSheetTitle } from "./spreadsheet";

export function blankAiWrites(sheetTitle: string, formulas: SheetsValue, writes: ReadonlyArray<{ rowNumber: number; cells: Array<{ letter: string; formula: string }> }>): SheetsBatchValueUpdate[] {
  const updates: SheetsBatchValueUpdate[] = [];
  for (const write of writes) {
    for (const cell of write.cells) {
      if (!/^[A-Z]+$/.test(cell.letter) || !Number.isSafeInteger(write.rowNumber) || write.rowNumber < 2) throw new Error("Invalid AI target cell");
      const column = [...cell.letter].reduce((value, character) => value * 26 + character.charCodeAt(0) - 64, 0) - 1;
      const current = formulas[write.rowNumber - 1]?.[column];
      if (current !== null && current !== undefined && current !== "") continue;
      updates.push({ rangeA1: `${quoteSheetTitle(sheetTitle)}!${cell.letter}${write.rowNumber}`, values: [[cell.formula]], parseFormulas: true });
    }
  }
  return updates;
}
