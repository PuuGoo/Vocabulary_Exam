import { importWordKey } from "@/lib/importDedup";
import { gridFromValuesRange, isRawAiFormula, mapHeadersToFieldKeys } from "./parser";
import { SOURCE_ID_HEADER, STT_HEADER, type GoogleSheetTemplate } from "./template";
import type { SheetsValue } from "./api";
import { isValidSourceId } from "./identity";
import { aiColumnsForTemplate, buildAiColumnFormulas, type AiPromptOverrides } from "./aiFormula";

export type SheetHealthIssue = { code: string; message: string; rows?: number[] };
export type SheetHealthReport = { healthy: boolean; issues: SheetHealthIssue[]; rowsScanned: number; pendingAiCells: number; checkedAt: string };

export function inspectSheetHealth(input: {
  values: SheetsValue; formulas: SheetsValue; template: GoogleSheetTemplate; setType: string;
  mappings: Array<{ sourceId: string; wordId: number | null; deletedAt: Date | null }>;
  channel: { status: string; expirationAt: Date | null; channelTokenHash: string | null } | null;
  enabled: boolean; status: string; templateVersion: number;
  aiPrompts?: AiPromptOverrides | null;
}): SheetHealthReport {
  const grid = gridFromValuesRange(input.values);
  const formulaGrid = gridFromValuesRange(input.formulas);
  let columns: Map<number, string>;
  try {
    columns = mapHeadersToFieldKeys(grid.headers, input.template);
  } catch (error) {
    return { healthy: false, issues: [{ code: "DUPLICATE_HEADERS", message: error instanceof Error ? error.message : "Ambiguous headers" }], rowsScanned: 0, pendingAiCells: 0, checkedAt: new Date().toISOString() };
  }
  const keys = new Set(columns.values());
  const issues: SheetHealthIssue[] = [];
  const missing = input.template.fields.filter(field => !field.displayOnly && !keys.has(field.key));
  if (missing.length) issues.push({ code: "HEADERS_MISSING", message: `Thiếu cột: ${missing.map(field => field.header).join(", ")}. Không tự ghi đè hàng tiêu đề.` });
  const normalizedHeaders = grid.headers.map(header => header.trim().toLowerCase());
  if (new Set(normalizedHeaders.filter(Boolean)).size !== normalizedHeaders.filter(Boolean).length) issues.push({ code: "DUPLICATE_HEADERS", message: "Có tên cột trùng nhau. Hãy sửa tiêu đề trước khi đồng bộ." });
  if (grid.headers[0]?.trim().toUpperCase() !== STT_HEADER) issues.push({ code: "STT_COLUMN", message: "Cột đầu tiên phải là STT." });
  const sourceColumn = [...columns].find(([, key]) => key === SOURCE_ID_HEADER)?.[0];
  const seenIds = new Map<string, number>();
  const seenWords = new Map<string, number>();
  const missingIds: number[] = [];
  const duplicateIds: number[] = [];
  const invalidIds: number[] = [];
  const duplicateWords: number[] = [];
  const missingMappings: number[] = [];
  const missingStt: number[] = [];
  const outdatedPrompts: number[] = [];
  const mappingById = new Map(input.mappings.map(mapping => [mapping.sourceId, mapping]));
  let rowsScanned = 0;
  let pendingAiCells = 0;
  for (const [index, cells] of grid.rows.entries()) {
    const values: Record<string, string> = {};
    for (const [column, key] of columns) values[key] = cells[column] ?? "";
    const key = importWordKey(values, input.setType);
    if (!values.term?.trim() && !values.v1?.trim()) continue;
    rowsScanned += 1;
    const rowNumber = index + 2;
    const sourceId = sourceColumn == null ? "" : (cells[sourceColumn] ?? "").trim();
    if (!sourceId) missingIds.push(rowNumber);
    else {
      if (!isValidSourceId(sourceId)) invalidIds.push(rowNumber);
      if (seenIds.has(sourceId)) duplicateIds.push(rowNumber);
      seenIds.set(sourceId, rowNumber);
      const mapping = mappingById.get(sourceId);
      if (!mapping?.wordId || mapping.deletedAt) missingMappings.push(rowNumber);
    }
    if (seenWords.has(key)) duplicateWords.push(rowNumber);
    seenWords.set(key, rowNumber);
    if (grid.headers[0]?.trim().toUpperCase() === STT_HEADER && !String(formulaGrid.rows[index]?.[0] ?? "").startsWith("=")) missingStt.push(rowNumber);
    for (const cell of formulaGrid.rows[index] ?? []) if (isRawAiFormula(cell)) pendingAiCells += 1;
    for (const plan of aiColumnsForTemplate(input.template.templateType)) {
      const column = [...columns].find(([, field]) => field === plan.key)?.[0];
      if (column === undefined) continue;
      const formula = String(formulaGrid.rows[index]?.[column] ?? "");
      if (!isRawAiFormula(formula)) continue;
      const functionName = /^=Gemini\(/i.test(formula.trim()) ? "Gemini" : "AI";
      const [expected] = buildAiColumnFormulas(input.template, functionName, plan, 1, rowNumber, input.aiPrompts);
      if (expected && formula.trim() !== expected.trim()) outdatedPrompts.push(rowNumber);
    }
  }
  const groups: Array<[string, string, number[]]> = [
    ["IDS_MISSING", "Dòng chưa có __lexora_id; cần sửa ID hệ thống.", missingIds],
    ["IDS_DUPLICATE", "ID trùng nhau; cần kiểm tra trước khi đồng bộ.", duplicateIds],
    ["IDS_INVALID", "ID không đúng định dạng Lexora. Không tự suy đoán danh tính dòng.", invalidIds],
    ["WORDS_DUPLICATE", "Từ vựng trùng theo quy tắc nhập liệu chung.", duplicateWords],
    ["MAPPINGS_MISSING", "Dòng chưa có ánh xạ từ vựng đang hoạt động.", missingMappings],
    ["STT_FORMULA", "STT chưa có công thức tự đánh số.", missingStt],
  ];
  for (const [code, message, rows] of groups) if (rows.length) issues.push({ code, message: `${message} (${rows.length} dòng)`, rows: rows.slice(0, 100) });
  if (outdatedPrompts.length) issues.push({ code: "AI_PROMPT_DIFFERS", message: `${outdatedPrompts.length} công thức AI khác prompt hiện tại. Có thể là công thức tùy chỉnh; xem lại trước khi áp dụng prompt. Nội dung văn bản không bị thay đổi.`, rows: [...new Set(outdatedPrompts)].slice(0, 100) });
  if (!input.channel || input.channel.status !== "active" || !input.channel.channelTokenHash || !input.channel.expirationAt || input.channel.expirationAt.getTime() <= Date.now()) issues.push({ code: "WATCH_INACTIVE", message: "Kênh nhận thông báo thiếu, hết hạn hoặc không hợp lệ. Hãy sửa kết nối." });
  if (!input.enabled || input.status !== "connected") issues.push({ code: "SYNC_STATE", message: `Trạng thái đồng bộ: ${input.status}; ${input.enabled ? "đang bật" : "đã tắt"}.` });
  if (input.templateVersion !== input.template.templateVersion) issues.push({ code: "TEMPLATE_VERSION", message: "Phiên bản template khác phiên bản hiện tại. Kiểm tra cột trước khi nâng cấp." });
  return { healthy: issues.length === 0, issues, rowsScanned, pendingAiCells, checkedAt: new Date().toISOString() };
}
