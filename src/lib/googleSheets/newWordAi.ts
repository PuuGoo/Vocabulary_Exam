import type { SheetsBatchValueUpdate, SheetsValue } from "./api";
import { aiColumnsForTemplate, buildAiColumnFormulas, type AiPromptOverrides } from "./aiFormula";
import { mapHeadersToFieldKeys } from "./parser";
import { columnLetter, quoteSheetTitle } from "./spreadsheet";
import { SOURCE_ID_HEADER, type GoogleSheetTemplate } from "./template";

export function newWordAiUpdates(template: GoogleSheetTemplate, sheetTitle: string, rows: SheetsValue, sourceId: string, prompts: AiPromptOverrides | null): SheetsBatchValueUpdate[] {
  const headers = (rows[0] ?? []).map(value => String(value ?? ""));
  const columns = mapHeadersToFieldKeys(headers, template);
  const idColumn = [...columns].find(([, key]) => key === SOURCE_ID_HEADER)?.[0];
  if (idColumn === undefined) throw new Error("Source ID column missing");
  const matches = rows.flatMap((row, index) => index > 0 && String(row[idColumn] ?? "").trim() === sourceId ? [index] : []);
  if (matches.length !== 1) throw new Error("New word row identity is ambiguous or missing");
  const rowIndex = matches[0];
  const actualTemplate = { ...template, fields: headers.map((header, index) => template.fields.find(field => field.key === columns.get(index)) ?? { key: `__unmanaged_${index}`, header, width: 100, wrap: false, displayOnly: true }) };
  const updates: SheetsBatchValueUpdate[] = [];
  for (const plan of aiColumnsForTemplate(template.templateType)) {
    const column = [...columns].find(([, key]) => key === plan.key)?.[0];
    if (column === undefined || String(rows[rowIndex][column] ?? "").trim() !== "") continue;
    const [formula] = buildAiColumnFormulas(actualTemplate, "AI", plan, 1, rowIndex + 1, prompts);
    if (formula) updates.push({ rangeA1: `${quoteSheetTitle(sheetTitle)}!${columnLetter(column)}${rowIndex + 1}`, values: [[formula]], parseFormulas: true });
  }
  return updates;
}
