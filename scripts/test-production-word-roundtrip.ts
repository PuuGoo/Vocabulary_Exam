import "dotenv/config";
import { request } from "playwright-core";
import postgres from "postgres";
import { apiForUser } from "../src/lib/googleSheets/sheetLifecycle";

async function main() {
  if (!process.env.SHEETS_E2E_USERNAME || !process.env.SHEETS_E2E_PASSWORD) throw new Error("Test credentials required");
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const http = await request.newContext({ baseURL: "https://vocabulary-exam.vercel.app" });
  const term = `lexora-e2e-${Date.now()}`;
  let createdId: number | undefined;
  let api: Awaited<ReturnType<typeof apiForUser>> | undefined;
  let connection: Record<string, any> | undefined;
  let range = "";
  try {
    const login = await http.post("/api/auth/login", { data: { username: process.env.SHEETS_E2E_USERNAME, password: process.env.SHEETS_E2E_PASSWORD } });
    if (!login.ok()) throw new Error(`Login ${login.status()}`);
    [connection] = await client`select * from google_sheet_connections where id=200`;
    if (!connection?.enabled || connection.status !== "connected") throw new Error("Test connection inactive");
    api = await apiForUser(connection.created_by);
    const tab = (await api.getSpreadsheetMetadata(connection.spreadsheet_id)).sheets.find(item => item.sheetId === connection!.sheet_id);
    if (!tab) throw new Error("Tab missing");
    range = `'${tab.title.replace(/'/g, "''")}'!A:AZ`;
    const created = await http.post(`/api/admin/sets/${connection.set_id}/words`, { data: { term, meaning: "Từ tạm kiểm thử; tự dọn", example: "Production roundtrip test" } });
    const body = await created.json();
    createdId = body.word?.id;
    console.log(JSON.stringify({ phase: "create", status: created.status(), wordId: createdId, googleSheets: body.googleSheets, error: body.error, term }));
    if (!created.ok() || !createdId) throw new Error("Create failed");
    const rows = await api.readValues(connection.spreadsheet_id, range);
    console.log(JSON.stringify({ phase: "sheet_after_create", present: rows.some(row => row.includes(term)) }));
    const rowIndex = rows.findIndex(row => row.includes(term));
    const exampleColumn = rows[0].findIndex(value => value === "Example");
    if (rowIndex < 1 || exampleColumn < 0) throw new Error("Test row/Example column missing");
    const startedAt = new Date();
    await api.writeValues(connection.spreadsheet_id, `'${tab.title.replace(/'/g, "''")}'!${String.fromCharCode(65 + exampleColumn)}${rowIndex + 1}`, [["Test sheet automatic update"]]);
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      const [observed] = await client`select id,example from words where id=${createdId}`;
      if (observed?.example === "Test sheet automatic update" || attempt === 11) {
        const runs = await client`select id,trigger_type,status,rows_updated,error_message from google_sheet_sync_runs where connection_id=${connection.id} and started_at >= ${startedAt} order by id`;
        console.log(JSON.stringify({ phase: "sheet_edit_to_database", elapsedSeconds: (attempt + 1) * 5, word: observed, runs }));
        break;
      }
    }
    const deleted = await http.delete(`/api/admin/words/${createdId}`);
    console.log(JSON.stringify({ phase: "delete", status: deleted.status(), body: await deleted.text() }));
    await new Promise(resolve => setTimeout(resolve, 15000));
    const after = await api.readValues(connection.spreadsheet_id, range);
    const remaining = await client`select id from words where set_id=${connection.set_id} and term=${term}`;
    console.log(JSON.stringify({ phase: "after_delete_15s", sheetPresent: after.some(row => row.includes(term)), databaseIds: remaining.map(row => row.id) }));
  } finally {
    if (api && connection && range) {
      const rows = await api.readValues(connection.spreadsheet_id, range);
      const matches = rows.flatMap((row, index) => index > 0 && row.includes(term) ? [index] : []).reverse();
      if (matches.length) await api.batchUpdate(connection.spreadsheet_id, matches.map(index => ({ deleteDimension: { range: { sheetId: connection!.sheet_id, dimension: "ROWS", startIndex: index, endIndex: index + 1 } } })));
      await new Promise(resolve => setTimeout(resolve, 5000));
      const leftovers = await client`select id from words where set_id=${connection.set_id} and term=${term}`;
      for (const word of leftovers) {
        const response = await http.delete(`/api/admin/words/${word.id}`);
        console.log(JSON.stringify({ phase: "cleanup", wordId: word.id, status: response.status() }));
      }
      console.log(JSON.stringify({ phase: "cleanup_check", sheetPresent: (await api.readValues(connection.spreadsheet_id, range)).some(row => row.includes(term)), databaseCount: (await client`select id from words where set_id=${connection.set_id} and term=${term}`).length }));
    }
    await http.dispose();
    await client.end();
    await global.__pgClient?.end();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
