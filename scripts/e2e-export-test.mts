/**
 * Reproduce the export bug: create a real Google Sheet for a fresh set with a
 * full-fledged word, read it back, and report exactly which columns survived.
 *
 * Usage:
 *   node --import tsx scripts/e2e-export-test.mts
 *
 * Cleanup: deletes the probe spreadsheet + DB rows even on failure.
 */

import "dotenv/config";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL as string, { max: 1, ssl: "require", connect_timeout: 30 });
const BASE = Date.now();

async function main() {
  const { db } = await import("@/db");
  const { vocabSets, words, googleSheetConnections, googleSheetRowMappings, googleSheetSyncChannels, googleSheetSyncRuns, googleSheetSyncPending, googleSheetSyncLocks, googleSheetCreateLocks } = await import("@/db/schema");
  const { eq, asc, desc } = await import("drizzle-orm");
  const { createGoogleSheetForSet } = await import("@/lib/googleSheets/sheetLifecycle");
  const { getGoogleSheetTemplate } = await import("@/lib/googleSheets/template");

  // ---- setup: a fresh set + one full word ---------------------------------
  const [admin] = await sql`select id from users where role='admin' order by id limit 1`;
  const [set] = await sql`insert into vocab_sets (name, type, language_code, translation_language_code, language_settings, created_by)
    values (${`__export_probe__${BASE}`}, 'ielts_vocab', 'en', 'vi', '{}', ${admin.id}) returning id`;
  const setId = set.id;

  await sql`insert into words (set_id, position, term, meaning, ipa, wtype, example, cefr_level)
    values (${setId}, 1, 'hello', 'xin chào', '/həˈləʊ/', 'noun', 'Hello there!', 'A1')`;

  const setRow = (await db.select().from(vocabSets).where(eq(vocabSets.id, setId)).limit(1))[0];
  const template = getGoogleSheetTemplate(setRow);
  console.log("[1] template fields:", template.fields.length, "| headers:", template.fields.map((f) => f.header).join(" | "));

  const dbWord = (await db.select().from(words).where(eq(words.setId, setId)).orderBy(asc(words.position)).limit(1))[0];
  console.log("[2] DB word:", JSON.stringify({ term: dbWord.term, meaning: dbWord.meaning, ipa: dbWord.ipa, wtype: dbWord.wtype, example: dbWord.example, cefrLevel: dbWord.cefrLevel }));

  // ---- create a real spreadsheet ------------------------------------------
  console.log("[3] calling createGoogleSheetForSet with the REAL Google API...");
  const t0 = Date.now();
  const created = await createGoogleSheetForSet(setId, { userId: admin.id });
  console.log(`    created in ${Date.now() - t0}ms: ${created.spreadsheetUrl}`);

  // ---- read it back --------------------------------------------------------
  const { loadGoogleToken } = await import("@/lib/googleSheets/auth");
  const { createGoogleWorkspaceApi } = await import("@/lib/googleSheets/client");
  const token = await loadGoogleToken(admin.id);
  const api = createGoogleWorkspaceApi({ ...token!, expiresAt: new Date(Date.now() - 3600_000) });

  const values = await api.readValues(created.spreadsheetId, `'${created.sheetTitle.replace(/'/g, "''")}'!A:Q`);
  const header = (values[0] || []).map((c) => String(c ?? ""));
  const dataRow = (values[1] || []).map((c) => String(c ?? ""));

  console.log("\n=== EXPORT RESULT ===");
  console.log("header cols :", header.length);
  console.log("data cols   :", dataRow.length);
  console.log("header      :", JSON.stringify(header));
  console.log("data        :", JSON.stringify(dataRow));

  const missing: string[] = [];
  header.forEach((h, i) => {
    const key = template.fields.find((f) => f.header === h)?.key;
    if (!key || key === "__stt" || key === "__lexora_id") return;
    const dbValue = (dbWord as unknown as Record<string, unknown>)[key];
    const dbStr = dbValue == null ? "" : String(dbValue);
    const got = dataRow[i] ?? "";
    const ok = dbStr === "" ? got === "" : got === dbStr;
    if (!ok) missing.push(`${h} (col ${i}): db=${JSON.stringify(dbStr)} sheet=${JSON.stringify(got)}`);
  });
  console.log("\n[4] column-by-column check:");
  header.forEach((h, i) => {
    const key = template.fields.find((f) => f.header === h)?.key;
    if (!key) return;
    const dbValue = (dbWord as unknown as Record<string, unknown>)[key];
    const dbStr = dbValue == null ? "" : String(dbValue);
    const got = dataRow[i] ?? "";
    const flag = dbStr === (got === "" ? "" : got) ? "OK  " : "MISS";
    if (key !== "__stt") console.log(`   ${flag} ${h.padEnd(24)} db=${JSON.stringify(dbStr)} sheet=${JSON.stringify(got)}`);
  });
  console.log(`\n[5] ${missing.length === 0 ? "ALL COLUMNS SURVIVED" : `MISSING/CORRUPTED ${missing.length} COLUMN(S)`}`);
  for (const m of missing) console.log("   -", m);

  // ---- mappings written? ---------------------------------------------------
  const [mappings] = await sql`select count(*)::int as n from google_sheet_row_mappings where connection_id = ${created.connectionId}`;
  console.log(`[6] row mappings written: ${mappings.n} (expected 1)`);

  const verdict = missing.length === 0 && mappings.n === 1;
  console.log(`\n${verdict ? "PASS" : "FAIL"}: export ${verdict ? "preserved every column" : "lost data"}`);

  await cleanup(created.spreadsheetId, setId, created.connectionId);
  await sql.end();
  process.exit(verdict ? 0 : 2);
}

async function cleanup(spreadsheetId: string, setId: number, connectionId: number) {
  try {
    const { loadGoogleToken } = await import("@/lib/googleSheets/auth");
    const { google } = await import("googleapis");
    const { decryptSecret } = await import("@/lib/googleSheets/crypto");
    const { db } = await import("@/db");
    const { googleSheetOauthTokens } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const token = await loadGoogleToken(1);
    if (token) {
      const auth = new google.auth.OAuth2({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, redirectUri: process.env.GOOGLE_REDIRECT_URI });
      auth.setCredentials({ access_token: token.accessToken, refresh_token: token.refreshToken ?? undefined, expiry_date: token.expiresAt.getTime() });
      const drive = google.drive({ version: "v3", auth });
      await drive.files.delete({ fileId: spreadsheetId }).catch(() => undefined);
      console.log("[cleanup] spreadsheet deleted from Drive");
    }
  } catch (e) { console.warn("[cleanup] could not delete spreadsheet:", (e as Error).message); }

  try {
    await sql`delete from google_sheet_create_locks where set_id = ${setId}`;
    await sql`delete from google_sheet_row_mappings where connection_id = ${connectionId}`;
    await sql`delete from google_sheet_sync_channels where connection_id = ${connectionId}`;
    await sql`delete from google_sheet_sync_runs where connection_id = ${connectionId}`;
    await sql`delete from google_sheet_sync_pending where connection_id = ${connectionId}`;
    await sql`delete from google_sheet_sync_locks where connection_id = ${connectionId}`;
    await sql`delete from google_sheet_connections where id = ${connectionId}`;
    await sql`delete from words where set_id = ${setId}`;
    await sql`delete from vocab_sets where id = ${setId}`;
    console.log("[cleanup] DB rows deleted");
  } catch (e) { console.warn("[cleanup] could not delete DB rows:", (e as Error).message); }
}

main().catch(async (e) => {
  console.error("E2E ERROR:", e instanceof Error ? `${e.name}: ${e.message}` : e);
  await sql.end().catch(() => undefined);
  process.exit(1);
});