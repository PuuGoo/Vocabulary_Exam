import "dotenv/config";
import { apiForUser } from "../src/lib/googleSheets/sheetLifecycle";
import postgres from "postgres";
async function main() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const [connection] = await client`select created_by,spreadsheet_id,sheet_id from google_sheet_connections where id=200`;
    const api = await apiForUser(connection.created_by);
    const tab = (await api.getSpreadsheetMetadata(connection.spreadsheet_id)).sheets.find(tab => tab.sheetId === connection.sheet_id)!;
    const rows = await api.readValues(connection.spreadsheet_id, `'${tab.title.replace(/'/g, "''")}'!A:AZ`, { renderOption: "FORMULA" });
    console.log(JSON.stringify({ tab, populated: rows.flatMap((row,index) => index > 0 && (row[1] || row[2]) ? [{ row: index + 1, id: row[1], word: row[2] }] : []), bufferExample: rows[11] }));
  } finally { await client.end(); await global.__pgClient?.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
