/**
 * E2E real-time test against production.
 *
 * Usage:
 *   node --import tsx scripts/e2e-realtime-test.mts
 *
 * What it does:
 *   1. POST /api/auth/login with the provided credentials, keep the session cookie.
 *   2. Read the current `words` row + `google_sheet_sync_runs.last row` for the
 *      target set, record the DB state BEFORE the sheet edit.
 *   3. Edit the "Meaning" cell in the real Google Sheet via the Google Sheets API
 *      (using the stored OAuth token in the database).
 *   4. Poll PostgreSQL every 3s for up to N seconds.
 *   5. The moment `words.meaning` matches the new value, print the elapsed time.
 *
 * The test NEVER presses "Sync now". If it completes, near-real-time webhook sync
 * is proven to work end-to-end on production.
 */

import "dotenv/config";
import postgres from "postgres";

const BASE = "https://vocabulary-exam.vercel.app";
const SET_ID = Number(process.env.TEST_SET_ID || 138);
const USERNAME = process.env.TEST_USERNAME || "admin";
const PASSWORD = process.env.TEST_PASSWORD || "admin123";
const NEW_MEANING = `xin chào / test realtime ${Date.now()}`;
const POLL_INTERVAL_MS = 3000;
const TIMEOUT_S = Number(process.env.TEST_TIMEOUT_S || 90);

const sql = postgres(process.env.DATABASE_URL as string, { max: 1, ssl: "require", connect_timeout: 30 });

function fmt(ms: number): string { return `${(ms / 1000).toFixed(2)}s`; }

async function main() {
  // --- 0. Preflight --------------------------------------------------------
  const cfg = {
    clientId: Boolean(process.env.GOOGLE_CLIENT_ID),
    clientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
    redirectUri: Boolean(process.env.GOOGLE_REDIRECT_URI),
    webhookBase: process.env.GOOGLE_WEBHOOK_BASE_URL || null,
    encryptionKey: Boolean(process.env.GOOGLE_SHEET_TOKEN_ENCRYPTION_KEY),
  };
  console.log("[0] env:", JSON.stringify(cfg));
  if (!cfg.webhookBase) throw new Error("GOOGLE_WEBHOOK_BASE_URL missing");
  if (cfg.webhookBase !== BASE) console.warn(`    WARN: GOOGLE_WEBHOOK_BASE_URL=${cfg.webhookBase} ≠ ${BASE}`);

  // --- 1. Login ------------------------------------------------------------
  console.log(`[1] login ${USERNAME}...`);
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  if (!loginRes.ok) throw new Error(`login failed: ${loginRes.status} ${await loginRes.text()}`);
  const cookie = loginRes.headers.get("set-cookie") ?? "";
  const cookieHeader = cookie.split(";")[0];
  console.log(`    ok (cookie ${cookieHeader.split("=")[0]}=${cookieHeader.split("=")[1]?.slice(0, 8)}...)`);

  // --- 2. Snapshot DB BEFORE the edit --------------------------------------
  const [word] = await sql`select id, term, meaning from words where set_id = ${SET_ID} order by id limit 1`;
  if (!word) throw new Error(`no word found in set ${SET_ID}`);
  const [runBefore] = await sql`select id, trigger_type, status, started_at from google_sheet_sync_runs where connection_id = 58 order by id desc limit 1`;
  const [conn] = await sql`select id, set_id as setid, status, enabled, spreadsheet_id as spreadsheetid, spreadsheet_url as spreadsheeturl, sheet_title as sheettitle, last_synced_at, last_successful_sync_at from google_sheet_connections where set_id = ${SET_ID} limit 1`;
  const [channel] = await sql`select channel_id, resource_id, expiration_at, channel_token_hash is not null as has_token, last_message_number from google_sheet_sync_channels where connection_id = ${conn.id}`;
  console.log(`[2] BEFORE: word id=${word.id} meaning="${word.meaning}"`);
  console.log(`    connection id=${conn.id} status=${conn.status} enabled=${conn.enabled}`);
  console.log(`    last sync run id=${runBefore?.id} trigger=${runBefore?.trigger_type} at=${runBefore?.started_at}`);
  console.log(`    channel ${channel?.channel_id} has_token=${channel?.has_token} lastMsg=${channel?.last_message_number} expires=${channel?.expiration_at}`);

  // --- 3. Edit the Google Sheet for real -----------------------------------
  const { loadGoogleToken } = await import("@/lib/googleSheets/auth");
  const { createGoogleWorkspaceApi } = await import("@/lib/googleSheets/client");
  const token = await loadGoogleToken(1);
  if (!token) throw new Error("no stored Google token for user 1");
  const api = createGoogleWorkspaceApi({ ...token, expiresAt: new Date(Date.now() - 3600_000) });

  const values = await api.readValues(conn.spreadsheetid, `'${conn.sheettitle.replace(/'/g, "''")}'!A:Q`);
  const header = (values[0] || []).map((c) => String(c ?? ""));
  const meaningCol = header.findIndex((h) => h.trim().toLowerCase() === "meaning");
  if (meaningCol < 0) throw new Error(`no Meaning column in header: ${JSON.stringify(header)}`);
  const colLetter = (n: number) => { let s = ""; let x = n + 1; while (x) { s = String.fromCharCode(65 + ((x - 1) % 26)) + s; x = Math.floor((x - 1) / 26); } return s; };
  const meaningRange = `'${conn.sheettitle.replace(/'/g, "''")}'!${colLetter(meaningCol)}2:${colLetter(meaningCol)}2`;

  console.log(`[3] writing NEW meaning "${NEW_MEANING}" -> ${meaningRange}`);
  const t0 = Date.now();
  await api.writeValues(conn.spreadsheetid, meaningRange, [[NEW_MEANING]] as never);
  console.log(`    writeValues OK in ${Date.now() - t0}ms`);

  // --- 4. Poll the DB for the change ---------------------------------------
  console.log(`[4] polling PostgreSQL every ${POLL_INTERVAL_MS}ms for up to ${TIMEOUT_S}s (NO manual sync)...`);
  let synced = false;
  let elapsed = 0;
  let lastRunId = runBefore?.id ?? 0;
  const deadline = Date.now() + TIMEOUT_S * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    elapsed = Date.now() - t0;
    const [w] = await sql`select meaning from words where id = ${word.id}`;
    const [run] = await sql`select id, trigger_type, status, rows_updated, started_at, finished_at from google_sheet_sync_runs where connection_id = ${conn.id} order by id desc limit 1`;
    const [ch] = await sql`select last_message_number from google_sheet_sync_channels where connection_id = ${conn.id}`;
    const status = run && run.id !== lastRunId ? `run#${run.id} ${run.trigger_type} ${run.status} rows_updated=${run.rows_updated} ${run.started_at}` : "";
    console.log(`    +${fmt(elapsed)} meaning=${JSON.stringify(w.meaning)} ${status} lastMsg=${ch?.last_message_number}`);
    if (run && run.id !== lastRunId && run.trigger_type === "webhook" && run.status === "success") {
      lastRunId = run.id;
      if (w.meaning === NEW_MEANING) { synced = true; break; }
    }
  }

  // --- 5. Verdict -----------------------------------------------------------
  console.log("\n=== RESULT ===");
  if (!synced) {
    console.log(`FAIL: word meaning was NOT updated within ${TIMEOUT_S}s.`);
    const [ch] = await sql`select channel_id, expiration_at, channel_token_hash is not null as has_token, last_message_number, status from google_sheet_sync_channels where connection_id = ${conn.id}`;
    console.log(`channel: ${JSON.stringify(ch)}`);
    const [connAfter] = await sql`select status, last_synced_at, last_successful_sync_at, last_error from google_sheet_connections where id = ${conn.id}`;
    console.log(`connection after: ${JSON.stringify(connAfter)}`);
    console.log(`last run:`, JSON.stringify(await sql`select id, trigger_type, status, rows_updated, error_message, started_at from google_sheet_sync_runs where connection_id = ${conn.id} order by id desc limit 3`));
    process.exit(2);
  }

  console.log(`PASS: webhook sync completed in ${fmt(elapsed)} after the sheet edit.`);
  const [run] = await sql`select id, trigger_type, status, rows_read, rows_created, rows_updated, rows_unchanged, started_at, finished_at from google_sheet_sync_runs where connection_id = ${conn.id} order by id desc limit 1`;
  console.log(`sync run: ${JSON.stringify(run, null, 1)}`);
  const [wAfter] = await sql`select id, term, meaning from words where id = ${word.id}`;
  console.log(`word after: ${JSON.stringify(wAfter)}`);
  if (wAfter.id !== word.id) { console.log("FAIL: wordId changed!"); process.exit(3); }
  console.log(`wordId preserved: ${wAfter.id}`);

  // Restore the original meaning so the sheet stays clean.
  try {
    await api.writeValues(conn.spreadsheetid, meaningRange, [[word.meaning]] as never);
    console.log("restored original meaning in the sheet");
  } catch (e) {
    console.warn("could not restore original meaning:", (e as Error).message);
  }
  await sql.end();
  process.exit(0);
}

main().catch((e) => {
  console.error("E2E ERROR:", e instanceof Error ? e.message : e);
  sql.end?.();
  process.exit(1);
});