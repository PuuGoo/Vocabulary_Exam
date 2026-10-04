import type { CreatedSpreadsheet, GoogleWorkspaceApi, WatchChannel } from "./api";
import type { GoogleSheetTemplate } from "./template";
import { buildSttFormulaForRow, sttColumnIndex } from "./template";
import { columnLetter, quoteSheetTitle, valuesForExport, buildRangeA1 } from "./spreadsheet";
import { configureSheetLayout } from "./formatting";
import { aiColumnLetters, aiColumnsForTemplate, buildAiColumnFormulas, AI_FORMULA_BUFFER_ROWS, AI_HELP_SHEET_TITLE, buildAiHelpRows, type AiPromptOverrides } from "./aiFormula";
import { verifyReplacementExport } from "./replacementVerification";

export async function prepareReplacementCandidate(input: {
  api: GoogleWorkspaceApi;
  template: GoogleSheetTemplate;
  title: string;
  rows: Array<{ sourceId: string; values: Record<string, string> }>;
  aiEnrich: boolean;
  prompts?: AiPromptOverrides | null;
  recordCreated: (spreadsheet: CreatedSpreadsheet) => Promise<void>;
  recordWatch: (watch: WatchChannel) => Promise<void>;
}) {
  const { api, template, rows } = input;
  const created = await api.createSpreadsheet({ title: input.title, sheetTitle: template.sheetTitle });
  await input.recordCreated(created);
  const values = valuesForExport(template, rows);
  const endRow = Math.max(values.length, 200);
  await api.batchUpdate(created.spreadsheetId, [{ updateSheetProperties: { properties: { sheetId: created.sheetId, gridProperties: { rowCount: Math.max(endRow + 200, 1000), columnCount: Math.max(template.fields.length, 26) } }, fields: "gridProperties(rowCount,columnCount)" } }]);
  await api.writeValues(created.spreadsheetId, buildRangeA1(created.sheetTitle, template.fields.length, values.length), values);
  const sttColumn = columnLetter(sttColumnIndex(template));
  await api.writeValues(created.spreadsheetId, `${quoteSheetTitle(created.sheetTitle)}!${sttColumn}2:${sttColumn}${endRow}`, Array.from({ length: endRow - 1 }, (_, index) => [buildSttFormulaForRow(template, index + 2)]), { parseFormulas: true });
  if (input.aiEnrich) {
    const startRow = rows.length + 2;
    const count = Math.max(0, AI_FORMULA_BUFFER_ROWS - rows.length);
    const letters = aiColumnLetters(template, template.templateType);
    for (const plan of aiColumnsForTemplate(template.templateType)) {
      const letter = letters.get(plan.key);
      if (!letter || !count) continue;
      const formulas = buildAiColumnFormulas(template, "AI", plan, count, startRow, input.prompts);
      await api.writeValues(created.spreadsheetId, `${quoteSheetTitle(created.sheetTitle)}!${letter}${startRow}:${letter}${startRow + count - 1}`, formulas.map(formula => [formula]), { parseFormulas: true });
    }
    if (!api.addSheet) throw new Error("Không thể tạo tab hướng dẫn AI cho Sheet thay thế.");
    const help = await api.addSheet(created.spreadsheetId, AI_HELP_SHEET_TITLE);
    if (!help) throw new Error("Không thể xác minh tab hướng dẫn AI.");
    const helpRows = buildAiHelpRows(template.templateType);
    await api.writeValues(created.spreadsheetId, `${quoteSheetTitle(AI_HELP_SHEET_TITLE)}!A1`, helpRows);
  }
  await configureSheetLayout(api, { spreadsheetId: created.spreadsheetId, sheetId: created.sheetId, template, rowCount: rows.length });
  const metadata = await api.getSpreadsheetMetadata(created.spreadsheetId);
  if (!metadata.sheets.some(sheet => sheet.sheetId === created.sheetId)) throw new Error("Không tìm thấy tab mới sau khi chuẩn bị.");
  const readback = await api.readValues(created.spreadsheetId, `${quoteSheetTitle(created.sheetTitle)}!A:Z`);
  const verification = verifyReplacementExport(template, readback, rows);
  const watch = await api.createWatchChannel({ spreadsheetId: created.spreadsheetId, resourceId: created.spreadsheetId });
  await input.recordWatch(watch);
  if (!watch.channelId || !watch.resourceId || !watch.channelToken || !watch.expirationAt || watch.expirationAt.getTime() <= Date.now()) throw new Error("Kênh theo dõi Sheet mới chưa hợp lệ.");
  return { created, watch, verification };
}
