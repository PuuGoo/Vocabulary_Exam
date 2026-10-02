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
  const { getGoogleSheetTemplate } = await import("@/lib/googleSheets/template");
  const { buildRangeA1, valuesForExport } = await import("@/lib/googleSheets/spreadsheet");
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

  // --- 3. write header + vocabulary ----------------------------------------
  const values = valuesForExport(template, exportRows.map((row) => ({ sourceId: row.sourceId, values: exportValuesForWord(template, row.word) })));
  const rangeA1 = buildRangeA1(template.sheetTitle, template.fields.length, values.length);
  console.log(`writing ${values.length} row(s) x ${template.fields.length} col(s) -> ${rangeA1}`);
  await api.writeValues(connection.spreadsheetId, rangeA1, values);

  // --- 4. STT formula -------------------------------------------------------
  const { columnLetter } = await import("@/lib/googleSheets/spreadsheet");
  const { sttColumnIndex, buildSttFormulaForRow } = await import("@/lib/googleSheets/template");
  const sttLetter = columnLetter(sttColumnIndex(template));
  const lastRow = exportRows.length + 1;
  if (exportRows.length > 0) {
    const sttValues: string[][] = [];
    for (let row = 2; row <= lastRow; row += 1) sttValues.push([buildSttFormulaForRow(template, row)]);
    const sttRange = `'${template.sheetTitle.replace(/'/g, "''")}'!${sttLetter}2:${sttLetter}${lastRow}`;
    await api.writeValues(connection.spreadsheetId, sttRange, sttValues as never);
    console.log(`STT formula written to ${sttRange}`);
  }

  // --- 5. layout ------------------------------------------------------------
  await configureSheetLayout(api as never, {
    spreadsheetId: connection.spreadsheetId,
    sheetId: connection.sheetId,
    template,
    rowCount: exportRows.length,
  });
  console.log("layout applied (frozen header, widths, wrap, filter)");

  // --- 6. repair mappings ---------------------------------------------------
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
  await db.update(googleSheetConnections)
    .set({ rangeA1, sheetTitle: template.sheetTitle, templateType: template.templateType, templateVersion: template.templateVersion, lastError: null, lastErrorAt: null, updatedAt: new Date() })
    .where(eq(googleSheetConnections.id, connectionId));

  // --- 8. verify ------------------------------------------------------------
  const after = await api.readValues(connection.spreadsheetId, `'${template.sheetTitle.replace(/'/g, "''")}'!A:Q`);
  console.log(`\nsheet after: ${after.length} row(s) x ${Math.max(0, after[0]?.length ?? 0)} col(s)`);
  after.slice(0, Math.min(4, after.length)).forEach((row, i) => console.log(`  row${i}: ${JSON.stringify(row)}`));

  const headerOk = JSON.stringify(after[0] ?? []) === JSON.stringify(template.fields.map((f) => f.header));
  const dataOk = after.length === values.length;
  console.log(`\nheader matches template: ${headerOk}`);
  console.log(`row count matches vocabulary: ${dataOk} (sheet ${after.length} vs words ${values.length})`);
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