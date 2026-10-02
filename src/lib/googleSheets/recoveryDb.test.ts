import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { googleSheetConnections, googleSheetRowMappings, googleSheetSyncChannels, vocabSets, words } from "@/db/schema";
import { createFakeGoogleWorkspaceApi } from "@/lib/googleSheets/api";
import { connectionView } from "@/lib/googleSheets/recoveryState";
import { recoverGoogleSheetConnection } from "@/lib/googleSheets/recovery";
import { GoogleSheetsError } from "@/lib/googleSheets/errors";

const enabled = Boolean(process.env.DATABASE_URL && process.env.GOOGLE_SHEET_TOKEN_ENCRYPTION_KEY);

/**
 * Live-Postgres acceptance for the recovery flow.
 *
 * Uses the in-memory Google API fake, so no Google credentials are needed: the
 * point is that recovery repairs an *existing* connection row (mappings,
 * channel, enabled/status) without ever creating a second spreadsheet, and that
 * a genuinely missing spreadsheet surfaces SHEET_NOT_FOUND.
 */
test("recovery repairs an existing connection in place on real Postgres", { skip: !enabled, timeout: 90000 }, async () => {
  const sql = postgres(process.env.DATABASE_URL as string, { max: 1, ssl: "require", connect_timeout: 30 });
  let setId = 0;
  let connectionId = 0;
  let wordId = 0;
  const base = Date.now();
  try {
    const [admin] = await sql`select id from users where role='admin' order by id limit 1`;
    const [set] = await sql`insert into vocab_sets (name, type, language_code, translation_language_code, language_settings, created_by)
      values (${`__gs_recover__${base}`},'ielts_vocab','en','vi','{}',${admin.id}) returning id`;
    setId = set.id;
    const [word] = await sql`insert into words (set_id, position, meaning, term)
      values (${setId},1,'giảm nhẹ','mitigate') returning id`;
    wordId = word.id;

    // A half-finished create: the spreadsheet exists, the wiring is broken.
    const spreadsheetId = `recover-sheet-${base}`;
    const [conn] = await sql`insert into google_sheet_connections
      (set_id, created_by, spreadsheet_id, spreadsheet_url, spreadsheet_name, sheet_id, sheet_title, range_a1,
       template_type, template_version, sync_direction, delete_behavior, enabled, status, last_error)
      values (${setId},${admin.id},${spreadsheetId},'u','n',0,'Từ vựng IELTS','r','ielts_vocab',2,'google_to_lexora','archive',false,'error','orphaned create')
      returning id`;
    connectionId = conn.id;

    // The UI must agree this is an error state, not "Chưa kết nối".
    assert.equal(connectionView({ enabled: false, status: "error" }), "error");

    // The spreadsheet is reachable, so recovery must succeed in place.
    const api = createFakeGoogleWorkspaceApi();
    await api.createSpreadsheet({ title: "t", sheetTitle: "Từ vựng IELTS" }).then((created) => {
      assert.ok(created.spreadsheetId);
    });
    // Point the fake at our spreadsheet id by seeding it through a write.
    await api.writeValues(spreadsheetId, "'Từ vựng IELTS'!A1:B2", [["__lexora_id", "Word"], ["", "mitigate"]]);

    const result = await recoverGoogleSheetConnection(connectionId, { userId: admin.id }, api);
    assert.equal(result.recovered, true);
    assert.equal(result.connectionId, connectionId);
    assert.equal(result.spreadsheetId, spreadsheetId, "recovery must keep the same spreadsheet");

    const [after] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, connectionId)).limit(1);
    assert.equal(after.enabled, true, "recovery must re-enable the connection");
    assert.equal(after.status, "connected", "recovery must mark it connected");
    assert.equal(after.lastError, null, "recovery must clear the stale error");

    // Row mappings were repaired for the word that never got one.
    const mappings = await db.select().from(googleSheetRowMappings).where(eq(googleSheetRowMappings.connectionId, connectionId));
    assert.equal(mappings.length, 1, "recovery must create the missing row mapping");
    assert.equal(mappings[0].wordId, wordId);
    assert.ok(mappings[0].sourceId, "a stable source id is assigned");

    // A watch channel exists with a token digest, so webhook auth works again.
    const [channel] = await db.select().from(googleSheetSyncChannels).where(eq(googleSheetSyncChannels.connectionId, connectionId)).limit(1);
    assert.ok(channel, "recovery must (re)create the Drive watch channel");
    assert.ok(channel.channelTokenHash, "the channel must store a token digest");

    // The word row and set survive untouched.
    const [wordAfter] = await sql`select id, meaning from words where id=${wordId}`;
    assert.equal(wordAfter.id, wordId);

    // Only one connection row may exist for the set (unique backstop).
    const rows = await sql`select id from google_sheet_connections where set_id=${setId}`;
    assert.equal(rows.length, 1, "recovery must never produce a second connection row");
  } finally {
    try {
      await sql.begin(async (tx) => {
        await tx`delete from google_sheet_row_mappings where connection_id=${connectionId}`;
        await tx`delete from google_sheet_sync_channels where connection_id=${connectionId}`;
        await tx`delete from google_sheet_connections where id=${connectionId}`;
        await tx`delete from words where set_id=${setId}`;
        await tx`delete from vocab_sets where id=${setId}`;
      });
    } finally {
      await sql.end();
    }
  }
});

test("a spreadsheet that no longer exists surfaces SHEET_NOT_FOUND, not a duplicate", { skip: !enabled, timeout: 90000 }, async () => {
  const sql = postgres(process.env.DATABASE_URL as string, { max: 1, ssl: "require", connect_timeout: 30 });
  let setId = 0;
  let connectionId = 0;
  const base = Date.now();
  try {
    const [admin] = await sql`select id from users where role='admin' order by id limit 1`;
    const [set] = await sql`insert into vocab_sets (name, type, language_code, translation_language_code, language_settings, created_by)
      values (${`__gs_gone__${base}`},'ielts_vocab','en','vi','{}',${admin.id}) returning id`;
    setId = set.id;

    const [conn] = await sql`insert into google_sheet_connections
      (set_id, created_by, spreadsheet_id, spreadsheet_url, spreadsheet_name, sheet_id, sheet_title, range_a1,
       template_type, template_version, sync_direction, delete_behavior, enabled, status)
      values (${setId},${admin.id},${`gone-sheet-${base}`},'u','n',0,'T','r','ielts_vocab',2,'google_to_lexora','archive',false,'error')
      returning id`;
    connectionId = conn.id;

    // A fake API that has never seen this spreadsheet reports no access.
    const api = createFakeGoogleWorkspaceApi();
    await assert.rejects(
      () => recoverGoogleSheetConnection(connectionId, { userId: admin.id }, api),
      (error: unknown) => error instanceof GoogleSheetsError && error.code === "SHEET_NOT_FOUND",
      "an unreachable spreadsheet must surface SHEET_NOT_FOUND so a fresh sheet can be created",
    );

    // The row is marked broken rather than left pretending to be connected.
    const [after] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, connectionId)).limit(1);
    assert.equal(after.status, "error");
    assert.equal(after.enabled, false);
    assert.ok(after.lastError, "an actionable error is recorded");
  } finally {
    try {
      await sql.begin(async (tx) => {
        await tx`delete from google_sheet_row_mappings where connection_id=${connectionId}`;
        await tx`delete from google_sheet_sync_channels where connection_id=${connectionId}`;
        await tx`delete from google_sheet_connections where id=${connectionId}`;
        await tx`delete from vocab_sets where id=${setId}`;
      });
    } finally {
      await sql.end();
    }
  }
});