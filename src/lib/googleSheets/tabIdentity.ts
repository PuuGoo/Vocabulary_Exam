import type { SpreadsheetMetadata } from "./api";
import { GoogleSheetsError } from "./errors";

export function resolveConnectedTab(metadata: SpreadsheetMetadata, sheetId: number) {
  const tab = metadata.sheets.find(candidate => candidate.sheetId === sheetId);
  if (!tab) throw new GoogleSheetsError("Tab đã kết nối không còn. Từ vựng vẫn được giữ nguyên; hãy chọn kết nối khác hoặc thay Sheet.", "INVALID_SCHEMA", { retryable: false });
  return tab;
}
