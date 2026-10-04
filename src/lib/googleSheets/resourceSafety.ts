import { GoogleSheetsError } from "./errors";
import type { GoogleWorkspaceApi } from "./api";

export async function trashManagedSpreadsheet(connection: { managedByLexora: boolean; spreadsheetId: string }, confirmedSpreadsheetId: string, api: Pick<GoogleWorkspaceApi, "trashSpreadsheet">) {
  if (!connection.managedByLexora) throw new GoogleSheetsError("Lexora không được đưa Sheet bên ngoài vào Thùng rác.", "PERMISSION_DENIED", { status: 403 });
  if (confirmedSpreadsheetId !== connection.spreadsheetId) throw new GoogleSheetsError("Sheet đã thay đổi. Hãy mở lại hộp thoại xác nhận.", "INVALID_SCHEMA", { status: 409 });
  if (!api.trashSpreadsheet) throw new GoogleSheetsError("Google Drive chưa hỗ trợ thao tác này.", "NOT_CONFIGURED");
  await api.trashSpreadsheet(connection.spreadsheetId);
}
