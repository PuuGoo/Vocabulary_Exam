/**
 * Repair an existing Lexora Google Sheet in place (keeps the same spreadsheet
 * URL) by re-exporting the current vocabulary into the canonical template.
 *
 * Use when a sheet was created before the STT/export fixes and therefore holds
 * only a header row (or a partial set of columns).
 *
 * Usage:
 *   node --import tsx scripts/repair-sheet.mts <connectionId> [--dry-run]
 *
 * What it does:
 *   1. loads the connection + its vocabulary set,
 *   2. writes the full canonical header row,
 *   3. writes one row per word (source id + business fields),
 *   4. fills the STT column with the renumbering formula,
 *   5. reapplies the layout (now with a valid wrapStrategy),
 *   6. repairs the row mappings so future edits keep their identity,
 *   7. leaves learning data (word_progress / mistakes / skills) untouched.
 */

import "dotenv/config";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL as string, { max: 1, ssl: "require", connect_timeout: 30 });

const connectionId = Number(process.argv[2]);
const dryRun = process.argv.includes("--dry-run");
if (!Number.isInteger(connectionId) || connectionId < 1) {
  console.error("usage: node --import tsx scripts/repair-sheet.mts <connectionId> [--dry-run]");
  process.exit(1);
}

async function main() {
  const { db } = await import("@/db");
  const { googleSheetConnections, googleSheetRowMappings, vocabSets, words } = await import("@/db/schema");
  const { asc, eq } = await import("drizzle-orm");
  const { SOURCE_ID_HEADER, getGoogleSheetTemplate, sttColumnIndex, buildSttFormulaForRow } = await import("@/lib/googleSheets/template");
  const { buildRangeA1, columnLetter } = await import("@/lib/googleSheets/spreadsheet");
  const { configureSheetLayout } = await import("@/lib/googleSheets/formatting");
  const { computeWordFingerprint } = await import("@/lib/googleSheets/fingerprint");
  const { exportValuesForWord } = await import("@/lib/googleSheets/sheetLifecycle");
  const { generateSourceId } = await import("@/lib/googleSheets/identity");
  const { loadGoogleToken } = await import("@/lib/googleSheets/auth");
  const { createGoogleWorkspaceApi } = await import("@/lib/googleSheets/client");

  const [connection] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, connectionId)).limit(1);
  if (!connection) throw new Error(`connection ${connectionId} not found`);
  const [set] = await db.select().from(vocabSets).where(eq(vocabSets.id, connection.setId)).limit(1);
  if (!set) throw new Error(`vocab set ${connection.setId} not found`);

  const template = getGoogleSheetTemplate(set);
  const wordRows = await db.select().from(words).where(eq(words.setId, connection.setId)).orderBy(asc(words.position), asc(words.id));
  const mappings = await db.select().from(googleSheetRowMappings).where(eq(googleSheetRowMappings.connectionId, connectionId));
  const mappedWordIds = new Set(mappings.flatMap((row) => (row.wordId == null ? [] : [row.wordId])));

  console.log(`connection ${connectionId} -> set ${connection.setId} "${set.name}" (${set.type})`);
  console.log(`spreadsheet: ${connection.spreadsheetUrl}`);
  console.log(`template columns (${template.fields.length}): ${template.fields.map((f) => f.header).join(" | ")}`);
  console.log(`words in set: ${wordRows.length}`);
  console.log(`existing mappings: ${mappings.length} (covering ${mappedWordIds.size} words)`);
  console.log(`status=${connection.status} enabled=${connection.enabled}`);
  if (dryRun) {
    console.log("\n--dry-run: nothing was written.");
    await sql.end().catch(() => undefined);
    process.exit(0);
  }

  const token = await loadGoogleToken(connection.createdBy ?? 1);
  if (!token) throw new Error("no Google token stored for the connection owner");
  const api = createGoogleWorkspaceApi({ ...token, expiresAt: new Date(Date.now() - 3600_000) });

  // --- 1. current sheet state ------------------------------------------------
  const before = await api.readValues(connection.spreadsheetId, `'${connection.sheetTitle.replace(/'/g, "''")}'!A:Q`);
  console.log(`\nsheet before: ${before.length} row(s)`);
  before.slice(0, 3).forEach((row, i) => console.log(`  row${i}: ${JSON.stringify(row)}`));

  // --- 2. reuse existing source ids so identity is preserved ---------------
  const existingByWordId = new Map(mappings.filter((row) => row.wordId != null).map((row) => [row.wordId as number, row]));
  const exportRows = wordRows.map((word) => ({
    word,
    sourceId: existingByWordId.get(word.id)?.sourceId ?? generateSourceId(),
    reused: existingByWordId.has(word.id),
  }));
  const reusedCount = exportRows.filter((row) => row.reused).length;
  console.log(`\nsource ids: ${reusedCount} reused, ${exportRows.length - reusedCount} newly generated`);

  // --- 3. write header first (so column B exists before the formula) ------
  const headerRow = template.fields.map((f) => f.header);
  await api.writeValues(connection.spreadsheetId, `'${template.sheetTitle.replace(/'/g, "''")}'!A1:${columnLetter(template.fields.length - 1)}1`, [headerRow] as never);

  // --- 4. STT formula BEFORE the data (column B must exist for COUNTIF) ---
  const sttLetter = columnLetter(sttColumnIndex(template));
  const STT_BUFFER_ROWS = 200;
  const sttLastRow = Math.max(exportRows.length + 1, STT_BUFFER_ROWS);
  if (exportRows.length > 0) {
    const sttValues: string[][] = [];
    for (let row = 2; row <= sttLastRow; row += 1) sttValues.push([buildSttFormulaForRow(template, row)]);
    const sttRange = `'${template.sheetTitle.replace(/'/g, "''")}'!${sttLetter}2:${sttLetter}${sttLastRow}`;
    // parseFormulas: STT must be a real formula, otherwise the sheet shows the formula text.
    await api.writeValues(connection.spreadsheetId, sttRange, sttValues as never, { parseFormulas: true });
    console.log(`STT formula extended to row ${sttLastRow}`);
  }

  // --- 5. layout (freeze, widths, wrap, filter) ---------------------------
  await configureSheetLayout(api as never, {
    spreadsheetId: connection.spreadsheetId,
    sheetId: connection.sheetId,
    template,
    rowCount: exportRows.length,
  });
  console.log("layout applied");

  // --- 6. write vocabulary data AFTER header+STT+layout -------------------
  // The data write must skip column A: valuesForExport emits an empty string
  // there, which would wipe the renumbering formula written in step 4.
  if (exportRows.length > 0) {
    const columnsFromB = template.fields.filter((field) => !field.displayOnly);
    const dataRows = exportRows.map((row) => {
      const values = exportValuesForWord(template, row.word);
      return columnsFromB.map((field) => (field.key === SOURCE_ID_HEADER ? row.sourceId : values[field.key] ?? ""));
    });
    const firstCol = columnLetter(template.fields.findIndex((field) => field.displayOnly) + 1);
    const lastCol = columnLetter(template.fields.length - 1);
    const dataRangeA1 = `'${template.sheetTitle.replace(/'/g, "''")}'!${firstCol}2:${lastCol}${exportRows.length + 1}`;
    await api.writeValues(connection.spreadsheetId, dataRangeA1, dataRows as never);
    console.log(`vocabulary written to ${dataRangeA1}`);
  }

  // --- 7. repair mappings ---------------------------------------------------
  const missing = exportRows.filter((row) => !existingByWordId.has(row.word.id));
  for (const row of missing) {
    const fingerprint = computeWordFingerprint(set.type, exportValuesForWord(template, row.word));
    await db.insert(googleSheetRowMappings).values({
      connectionId,
      wordId: row.word.id,
      sourceId: row.sourceId,
      sheetRowNumber: 0,
      sourceFingerprint: fingerprint,
      lastSyncedFingerprint: fingerprint,
    });
    console.log(`  mapping created: word ${row.word.id} (${row.word.term}) <- ${row.sourceId}`);
  }
  // Keep existing mappings pointing at the right row.
  for (const [index, row] of exportRows.entries()) {
    const mapping = existingByWordId.get(row.word.id);
    if (mapping && mapping.sheetRowNumber !== index + 2) {
      await db.update(googleSheetRowMappings).set({ sheetRowNumber: index + 2, updatedAt: new Date() }).where(eq(googleSheetRowMappings.id, mapping.id));
      console.log(`  mapping row fixed: word ${row.word.id} -> row ${index + 2}`);
    }
  }

  // --- 7. refresh the stored range -----------------------------------------
  const finalRangeA1 = buildRangeA1(template.sheetTitle, template.fields.length, exportRows.length + 1);
  await db.update(googleSheetConnections)
    .set({ rangeA1: finalRangeA1, sheetTitle: template.sheetTitle, templateType: template.templateType, templateVersion: template.templateVersion, lastError: null, lastErrorAt: null, updatedAt: new Date() })
    .where(eq(googleSheetConnections.id, connectionId));

  // --- 8. verify ------------------------------------------------------------
  const after = await api.readValues(connection.spreadsheetId, `'${template.sheetTitle.replace(/'/g, "''")}'!A:Q`);
  console.log(`\nsheet after: ${after.length} row(s) x ${Math.max(0, after[0]?.length ?? 0)} col(s)`);
  after.slice(0, Math.min(4, after.length)).forEach((row, i) => console.log(`  row${i}: ${JSON.stringify(row)}`));

  const headerOk = JSON.stringify(after[0] ?? []) === JSON.stringify(template.fields.map((f) => f.header));
  const expectedRows = exportRows.length + 1; // + header
  const dataOk = after.length >= expectedRows && after[0]?.length === template.fields.length;
  console.log(`\nheader matches template: ${headerOk}`);
  console.log(`rows/cols OK: ${dataOk} (sheet ${after.length}x${after[0]?.length ?? 0}, expected >= ${expectedRows}x${template.fields.length})`);
  console.log(`mappings now: ${mappings.length + missing.length}`);
  console.log(`\n${headerOk && dataOk ? "REPAIR OK" : "REPAIR INCOMPLETE - inspect the output above"}`);

  await sql.end().catch(() => undefined);
  process.exit(headerOk && dataOk ? 0 : 2);
}

main().catch(async (e) => {
  console.error("REPAIR ERROR:", e instanceof Error ? `${e.name}: ${e.message}` : e);
  await sql.end().catch(() => undefined);
  process.exit(1);
});