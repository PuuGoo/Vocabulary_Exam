import type { SheetsValue } from "./api";
import { isRawAiFormula } from "./parser";

export function firstTemplateBufferRow(rows: SheetsValue, headers: string[]): number | null {
  for (let index = 1; index < rows.length; index += 1) {
    const buffer = rows[index].every((value, column) => {
      const text = String(value ?? "").trim();
      if (!text) return true;
      if (headers[column]?.trim().toUpperCase() === "STT" && text.startsWith("=")) return true;
      return isRawAiFormula(text);
    });
    if (buffer) return index + 1;
  }
  return null;
}
