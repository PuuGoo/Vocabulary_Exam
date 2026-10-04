import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { gridFromValuesRange } from "@/lib/googleSheets/parser";
import { getGoogleSheetTemplate } from "@/lib/googleSheets/template";
import { runVocabularySync } from "@/lib/googleSheets/syncVocabulary";
import { words } from "@/db/schema";

/**
 * Regression: a Google Sheet row that the admin started filling in but has not
 * finished must not be swallowed silently.
 *
 * Bug (reported): the admin typed hello/might/run/would/mean into Word but left
 * Meaning empty. Every sync reported status=success while skipping all five
 * rows, creating nothing, and the run row recorded validationErrorCount=5 with
 * an empty errorMessage - so the UI showed "sync done, 0 created" and the admin
 * had no idea why.
 */

const MEANING_MISSING = "REQUIRED_FIELDS_MISSING";

function headerOf(template: ReturnType<typeof getGoogleSheetTemplate>): string[] {
  return template.fields.map((field) => field.header);
}

async function seed() {
  const { vocabSets, googleSheetConnections } = await import("@/db/schema");
  const [admin] = await db.select().from((await import("@/db/schema")).users).where(eq((await import("@/db/schema")).users.username, "admin")).limit(1);
  const [set] = await db.insert(vocabSets).values({
    name: `__partial__${Date.now()}`, type: "ielts_vocab", languageCode: "en", translationLanguageCode: "vi",
    languageSettings: "{}", createdBy: admin.id,
  }).returning();
  const [conn] = await db.insert(googleSheetConnections).values({
    setId: set.id, createdBy: admin.id, spreadsheetId: `partial-${set.id}`, spreadsheetUrl: "u", spreadsheetName: "n",
    sheetId: 0, sheetTitle: "T\u1eeb v\u1ee5ng IELTS", rangeA1: "'T\u1eeb v\u1ee5ng IELTS'!A1:Q6",
    templateType: "ielts_vocab", templateVersion: 2, syncDirection: "google_to_lexora", deleteBehavior: "archive",
    enabled: true, status: "connected",
  }).returning();
  return { set, conn, adminId: admin.id };
}

async function cleanup(setId: number, connectionId: number) {
  const { googleSheetRowMappings, googleSheetConnections, vocabSets, words: w } = await import("@/db/schema");
  await db.delete(googleSheetRowMappings).where(eq(googleSheetRowMappings.connectionId, connectionId));
  await db.delete(w).where(eq(w.setId, setId));
  await db.delete(googleSheetConnections).where(eq(googleSheetConnections.id, connectionId));
  await db.delete(vocabSets).where(eq(vocabSets.id, setId));
}

test("a half-filled Sheet row is reported as an explicit validation error, not a silent skip", { skip: process.env.GOOGLE_SHEETS_TEST_DB !== "1" }, async () => {
  const { set, conn, adminId } = await seed();
  try {
    const tpl = getGoogleSheetTemplate(set as never);
    const header = headerOf(tpl);
    // Exactly what the admin had in the sheet: Word filled, Meaning empty.
    const grid = gridFromValuesRange([
      header,
      ["", "", "hello", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["", "", "might", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ]);
    const state = { id: conn.id, setId: set.id, spreadsheetId: conn.spreadsheetId, sheetTitle: tpl.sheetTitle, deleteBehavior: "archive", status: "connected", enabled: true };
    const { stats } = await db.transaction((tx) => runVocabularySync(state, grid, tx));

    assert.equal(stats.rowsRead, 2, "both rows are read");
    assert.equal(stats.rowsCreated, 0, "an incomplete row must not create a word");
    assert.equal(stats.validationErrorCount, 2, "both rows are counted as validation errors");
    assert.equal(stats.rowsSkipped, 2);
    assert.equal(stats.invalidRows.length, 2, "the engine must keep the per-row reason");
    assert.equal(stats.invalidRows[0].rowNumber, 2, "the message points at the spreadsheet row");
    assert.match(stats.invalidRows[0].message, /ngh\u0129a/i, "the reason is human readable");
    assert.equal(stats.invalidRows[0].rowNumber >= 2, true);

    const inserted = await db.select().from(words).where(eq(words.setId, set.id));
    assert.equal(inserted.length, 0, "nothing half-filled may leak into the database");
    void adminId;
  } finally {
    await cleanup(set.id, conn.id);
  }
});

test("a completed row still syncs normally alongside an incomplete one", { skip: process.env.GOOGLE_SHEETS_TEST_DB !== "1" }, async () => {
  const { set, conn } = await seed();
  try {
    const tpl = getGoogleSheetTemplate(set as never);
    const header = headerOf(tpl);
    const grid = gridFromValuesRange([
      header,
      ["", "", "hello", "", "", "", "", "", "", "", "", "", "", "", "", "", ""], // no meaning -> skipped
      ["", "", "world", "th\u1eb1 gi\u1edbi", "", "", "", "", "", "", "", "", "", "", "", "", ""], // complete -> created
    ]);
    const state = { id: conn.id, setId: set.id, spreadsheetId: conn.spreadsheetId, sheetTitle: tpl.sheetTitle, deleteBehavior: "archive", status: "connected", enabled: true };
    const { stats } = await db.transaction((tx) => runVocabularySync(state, grid, tx));

    assert.equal(stats.rowsCreated, 1, "the complete row is imported");
    assert.equal(stats.validationErrorCount, 1, "only the incomplete row is reported");
    assert.equal(stats.invalidRows.length, 1);
    assert.equal(stats.invalidRows[0].rowNumber, 2);

    const inserted = await db.select().from(words).where(eq(words.setId, set.id));
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].term, "world");
    assert.equal(inserted[0].meaning, "th\u1eb1 gi\u1edbi");

    // The generated __lexora_id must be queued for write-back so the row can be
    // edited and re-synced without losing identity.
    assert.equal(stats.idWrites.length, 1, "the new row gets a source id written back");
    assert.equal(stats.idWrites[0].rowNumber, 3);

    // Spec item 13: a word created from a new Sheet row must be reported in
    // changedWordIds, otherwise the admin list would never show it without a
    // manual browser reload.
    assert.ok(stats.changedWordIds.includes(inserted[0].id), "a created word must be reported so the UI can refresh");
  } finally {
    await cleanup(set.id, conn.id);
  }
});

test("the sync run persists WHY rows were skipped, not just how many", () => {
  const lifecycle = readFileSync("src/lib/googleSheets/sheetLifecycle.ts", "utf8");
  assert.match(
    lifecycle,
    /errorMessage: result\.stats\.invalidRows\.length/,
    "finishSyncRun must record the per-row reasons in errorMessage",
  );
  assert.match(
    lifecycle,
    /invalidRows: result\.stats\.invalidRows\.slice/,
    "the structured reasons are kept in the run metadata too",
  );

  // The admin panel is the only place the admin can act on this, so it must
  // surface the reasons instead of only counting them. After the UX redesign
  // the toast lives in the orchestrator and the count lives in the summary
  // component; both still read off the same per-row reasons.
  const panel = readFileSync("src/components/GoogleSheetsPanel.tsx", "utf8");
  const statsUi = readFileSync("src/components/google-sheets/GoogleSheetsSyncStats.tsx", "utf8");
  assert.match(panel, /stats\.invalidRows/, "the sync toast must list the skipped rows");
  assert.match(statsUi, /validationErrorCount/, "the history must show the skipped count");
});
