import type { SheetsValue } from "./api";
import type { GoogleSheetTemplate } from "./template";
import { gridFromValuesRange, parseSheetGrid } from "./parser";
import { fingerprintSheetValues } from "./fingerprint";

export function verifyReplacementExport(template: GoogleSheetTemplate, values: SheetsValue, expected: ReadonlyArray<{ sourceId: string; values: Record<string, string> }>) {
  const grid = gridFromValuesRange(values);
  if (template.fields.some((field, index) => grid.headers[index] !== field.header)) throw new Error("Sheet mới không đúng cấu trúc đã xuất.");
  const rows = parseSheetGrid(grid, template).filter(row => row.sourceId || Object.values(row.values).some(value => value.trim()));
  const byId = new Map(rows.map(row => [row.sourceId, row]));
  if (rows.length !== expected.length || byId.size !== expected.length) throw new Error("Số dòng hoặc danh tính trên Sheet mới không khớp.");
  for (const original of expected) {
    const actual = byId.get(original.sourceId);
    if (!actual || fingerprintSheetValues(template, actual.values) !== fingerprintSheetValues(template, original.values)) {
      throw new Error("Nội dung Sheet mới không khớp bản xuất; giữ nguyên Sheet cũ.");
    }
  }
  return { verifiedRows: rows.length };
}
