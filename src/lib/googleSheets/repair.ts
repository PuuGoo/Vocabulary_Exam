import type { SheetsBatchValueUpdate, SheetsValue } from "./api";
import { buildSttFormulaForRow, SOURCE_ID_HEADER, STT_FIELD_KEY, type GoogleSheetTemplate } from "./template";
import { gridFromValuesRange, mapHeadersToFieldKeys } from "./parser";
import { generateSourceId, isValidSourceId } from "./identity";
import { columnLetter, quoteSheetTitle } from "./spreadsheet";
import { importWordKey } from "@/lib/importDedup";

export function planSystemRepair(input: {
  formulas: SheetsValue; template: GoogleSheetTemplate; sheetTitle: string; setType: string;
  words: Array<{ id: number; term: string | null; v1: string | null; v2: string | null; v3: string | null }>;
  mappings: Array<{ wordId: number | null; sourceId: string }>;
}) {
  const grid = gridFromValuesRange(input.formulas);
  const expected = input.template.fields.map(field => field.header);
  if (expected.some((header, index) => grid.headers[index]?.trim() !== header)) throw new Error("Sửa hệ thống yêu cầu đúng thứ tự cột template; không tự ghi đè tiêu đề hoặc nội dung.");
  const columns = mapHeadersToFieldKeys(grid.headers, input.template);
  const idIndex = input.template.fields.findIndex(field => field.key === SOURCE_ID_HEADER);
  const sttIndex = input.template.fields.findIndex(field => field.key === STT_FIELD_KEY);
  const seen = new Set<string>();
  for (const row of grid.rows) {
    const sourceId = row[idIndex]?.trim();
    if (!sourceId) continue;
    if (!isValidSourceId(sourceId) || seen.has(sourceId)) throw new Error("Có ID sai hoặc trùng. Cần kiểm tra thủ công, không tự đổi danh tính dòng.");
    seen.add(sourceId);
  }
  const mappedByWord = new Map(input.mappings.map(mapping => [mapping.wordId, mapping.sourceId]));
  const wordsByKey = new Map<string, typeof input.words>();
  for (const word of input.words) {
    const key = importWordKey(word, input.setType);
    wordsByKey.set(key, [...(wordsByKey.get(key) ?? []), word]);
  }
  const updates: SheetsBatchValueUpdate[] = [];
  let idsAssigned = 0;
  let sttRepaired = 0;
  for (const [index, cells] of grid.rows.entries()) {
    const values: Record<string, string> = {};
    for (const [column, key] of columns) values[key] = cells[column] ?? "";
    if (!values.term?.trim() && !values.v1?.trim()) continue;
    const rowNumber = index + 2;
    if (!cells[idIndex]?.trim()) {
      const matches = wordsByKey.get(importWordKey(values, input.setType)) ?? [];
      if (matches.length > 1) throw new Error("Nhiều từ cùng danh tính; không thể tự gán ID an toàn.");
      const existing = matches.length ? mappedByWord.get(matches[0].id) : undefined;
      if (existing && seen.has(existing)) throw new Error("ID của từ đã xuất hiện ở dòng khác. Hãy xử lý dòng trùng trước.");
      const sourceId = existing ?? generateSourceId(seen);
      seen.add(sourceId);
      updates.push({ rangeA1: `${quoteSheetTitle(input.sheetTitle)}!${columnLetter(idIndex)}${rowNumber}`, values: [[sourceId]], parseFormulas: false });
      idsAssigned += 1;
    }
    if (!String(cells[sttIndex] ?? "").startsWith("=")) {
      updates.push({ rangeA1: `${quoteSheetTitle(input.sheetTitle)}!${columnLetter(sttIndex)}${rowNumber}`, values: [[buildSttFormulaForRow(input.template, rowNumber)]], parseFormulas: true });
      sttRepaired += 1;
    }
  }
  return { updates, idsAssigned, sttRepaired };
}
