export function sheetCardUrl(connection: { spreadsheetId: string; sheetId: number; status: string; externalState: string } | undefined): string | null {
  if (!connection || ["archived", "missing", "replaced"].includes(connection.status) || connection.externalState === "missing") return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(connection.spreadsheetId) || !Number.isSafeInteger(connection.sheetId) || connection.sheetId < 0) return null;
  return `https://docs.google.com/spreadsheets/d/${connection.spreadsheetId}/edit#gid=${connection.sheetId}`;
}
