import "dotenv/config";
import postgres from "postgres";
import { apiForUser } from "../src/lib/googleSheets/sheetLifecycle";

async function main() {
  const connectionId = Number(process.env.SHEETS_INSPECT_CONNECTION_ID || "200");
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const [connection] = await client`select id, set_id, created_by, spreadsheet_id, sheet_id, sheet_title, status, last_error from google_sheet_connections where id=${connectionId}`;
    if (!connection?.created_by) throw new Error("Connection or owner missing");
    const api = await apiForUser(connection.created_by);
    const metadata = await api.getSpreadsheetMetadata(connection.spreadsheet_id);
    const tab = metadata.sheets.find(sheet => sheet.sheetId === connection.sheet_id);
    if (!tab) throw new Error("Connected tab missing");
    const range = `'${tab.title.replace(/'/g, "''")}'!A1:Z3`;
    const [values, formulas, runs, mappings] = await Promise.all([
      api.readValues(connection.spreadsheet_id, range),
      api.readValues(connection.spreadsheet_id, range, { renderOption: "FORMULA" }),
      client`select id, trigger_type, status, started_at, rows_updated, error_message from google_sheet_sync_runs where connection_id=${connectionId} order by id desc limit 5`,
      client`select m.word_id, m.source_id, m.sheet_row_number, m.last_synced_fingerprint, w.term, w.example from google_sheet_row_mappings m join words w on w.id=m.word_id where m.connection_id=${connectionId} and w.term='hello'`,
    ]);
    console.log(JSON.stringify({ connectionId, status: connection.status, tab, values, formulas, runs, mappings }, null, 2));
  } finally {
    await client.end();
    await global.__pgClient?.end();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Inspection failed"); process.exitCode = 1; });
