import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { googleSheetConnections, googleSheetRowMappings, vocabSets, words } from "@/db/schema";
import { gridFromValuesRange, parseSheetGrid, type SheetGrid } from "@/lib/googleSheets/parser";
import { getGoogleSheetTemplate, SOURCE_ID_HEADER } from "@/lib/googleSheets/template";
import { computeWordFingerprint } from "@/lib/googleSheets/fingerprint";
import { generateSourceId, readSourceIdCell } from "@/lib/googleSheets/identity";
import { draftToWordInsert, parseVocabularyRows, type ParsedWordDraft } from "@/lib/vocabImport/parse";
import { appendWords } from "@/lib/wordOrder.server";
import { importWordKey } from "@/lib/importDedup";

export type SyncConnection = {
  id: number;
  setId: number;
  spreadsheetId: string;
  sheetTitle: string;
  deleteBehavior: string;
  status: string;
  enabled: boolean;
};

export type SyncStats = {
  rowsRead: number;
  rowsCreated: number;
  rowsUpdated: number;
  rowsUnchanged: number;
  rowsDeleted: number;
  rowsSkipped: number;
  duplicateCount: number;
  validationErrorCount: number;
  conflicts: Array<{ rowNumber: number; message: string }>;
  invalidRows: Array<{ rowNumber: number; message: string }>;
  idWrites: Array<{ rowNumber: number; sourceId: string }>;
  changedWordIds: number[];
};

export type SyncEngineResult = { stats: SyncStats; writeIds: boolean };

type GridPort = { readGrid: (connection: SyncConnection) => Promise<SheetGrid> };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function readSheetGrid(connection: SyncConnection, readValues: (spreadsheetId: string, range: string) => Promise<(string | number | boolean | null)[][]>): Promise<SheetGrid> {
  const range = `'${connection.sheetTitle.replace(/'/g, "''")}'!A:Z`;
  const values = await readValues(connection.spreadsheetId, range);
  return gridFromValuesRange(values);
}

/**
 * Google Sheet -> Lexora sync.
 *
 * Identity: `__lexora_id` first, then the same fallback identity used by the
 * CSV/XLSX importer (normalized term, or V1+V2+V3 for irregular verbs).
 * Row numbers are only bookkeeping; moving/sorting rows never changes identity.
 *
 * Content updates only touch `words`; word_progress / mistakes / skills /
 * review schedule are never written here.
 */
export async function runVocabularySync(
  connection: SyncConnection,
  grid: SheetGrid,
  tx: Tx,
): Promise<SyncEngineResult> {
  const [set] = await tx.select().from(vocabSets).where(eq(vocabSets.id, connection.setId)).limit(1);
  if (!set) throw new Error("Vocabulary set not found");
  const template = getGoogleSheetTemplate(set);
  const parsedRows = parseSheetGrid(grid, template);
  const [existingWords, mappings] = await Promise.all([
    tx.select().from(words).where(eq(words.setId, set.id)).orderBy(asc(words.position), asc(words.id)),
    tx.select().from(googleSheetRowMappings).where(eq(googleSheetRowMappings.connectionId, connection.id)),
  ]);

  const mappingBySourceId = new Map(mappings.map((mapping) => [mapping.sourceId, mapping]));
  const mappingByWordId = new Map(mappings.filter((mapping) => mapping.wordId != null).map((mapping) => [mapping.wordId as number, mapping]));
  const wordById = new Map(existingWords.map((word) => [word.id, word]));

  const existingKeys = existingWords.map((word) => importWordKey({ term: word.term, v1: word.v1, v2: word.v2, v3: word.v3 }, set.type));
  const draftsByRow = parseVocabularyRows(
    parsedRows.map((row) => ({ ...row.values, [SOURCE_ID_HEADER]: row.sourceId })),
    set,
    existingKeys,
    { dedupeAgainstExisting: false },
  );

  const invalidRows = draftsByRow.issues.filter((issue) => issue.code !== "DUPLICATE").map((issue) => ({ rowNumber: issue.rowNumber, message: issue.message }));
  let duplicateCount = draftsByRow.duplicateCount;
  // Each draft carries its own source row so blank/invalid rows never shift identity.
  const draftByRowNumber = new Map(draftsByRow.rows.map((draft) => [draft.rowNumber, draft]));

  const idWrites: Array<{ rowNumber: number; sourceId: string }> = [];
  const createdDrafts: Array<{ rowNumber: number; sourceId: string; draft: ParsedWordDraft; fingerprint: string }> = [];
  const updatedDrafts: Array<{ rowNumber: number; wordId: number; draft: ParsedWordDraft; fingerprint: string }> = [];
  const conflicts: Array<{ rowNumber: number; message: string }> = [];
  const unchangedWordIds = new Set<number>();
  const seenSourceIds = new Set<string>();

  for (const row of parsedRows) {
    if (!Object.values(row.values).some((value) => value !== "" && value != null)) continue; // blank row
    const resolvedSourceId = readSourceIdCell(row.sourceId);
    const draft = draftByRowNumber.get(row.rowNumber);
    if (!draft) continue;
    const identityKey = resolvedSourceId || importWordKey({ term: draft.term, v1: draft.v1, v2: draft.v2, v3: draft.v3 }, set.type);
    if (seenSourceIds.has(identityKey)) { duplicateCount += 1; continue; }
    seenSourceIds.add(identityKey);

    const mapping = resolvedSourceId ? mappingBySourceId.get(resolvedSourceId) : undefined;
    const fallbackKey = importWordKey({ term: draft.term, v1: draft.v1, v2: draft.v2, v3: draft.v3 }, set.type);
    const fallbackWord = existingWords.find((candidate) => importWordKey({ term: candidate.term, v1: candidate.v1, v2: candidate.v2, v3: candidate.v3 }, set.type) === fallbackKey);
    const fingerprint = computeWordFingerprint(set.type, { ...row.values } as Record<string, string>);
    const word = mapping?.wordId != null ? wordById.get(mapping.wordId) : fallbackWord;

    if (!word) {
      const sourceId = resolvedSourceId || generateSourceId(new Set(seenSourceIds));
      if (!resolvedSourceId) idWrites.push({ rowNumber: row.rowNumber, sourceId });
      createdDrafts.push({ rowNumber: row.rowNumber, sourceId, draft, fingerprint });
      continue;
    }

    const dbFingerprint = computeWordFingerprint(set.type, word as unknown as Record<string, string>);
    const lastSynced = mapping?.lastSyncedFingerprint ?? null;
    if (dbFingerprint === fingerprint && (!lastSynced || lastSynced === fingerprint)) { unchangedWordIds.add(word.id); continue; }
    if (lastSynced && dbFingerprint !== lastSynced && dbFingerprint !== fingerprint) {
      conflicts.push({ rowNumber: row.rowNumber, message: `Cột ${SOURCE_ID_HEADER}=${mapping?.sourceId} đã bị sửa trực tiếp trong Lexora; Sheet và DB đã phân kỳ.` });
      continue;
    }
    updatedDrafts.push({ rowNumber: row.rowNumber, wordId: word.id, draft, fingerprint });
  }

  const createdRows = createdDrafts.length ? await appendWords(tx, set.id, createdDrafts.map((entry) => draftToWordInsert(entry.draft))) : [];
  const changedWordIds: number[] = [];

  for (const [index, word] of createdRows.entries()) {
    const entry = createdDrafts[index];
    await tx.insert(googleSheetRowMappings).values({
      connectionId: connection.id,
      wordId: word.id,
      sourceId: entry.sourceId,
      sheetRowNumber: entry.rowNumber,
      sourceFingerprint: entry.fingerprint,
      lastSyncedFingerprint: entry.fingerprint,
    });
    changedWordIds.push(word.id);
  }

  for (const entry of updatedDrafts) {
    await tx.update(words).set(draftToWordInsert(entry.draft)).where(eq(words.id, entry.wordId));
    const mapping = mappingByWordId.get(entry.wordId);
    if (mapping) {
      await tx.update(googleSheetRowMappings)
        .set({ sheetRowNumber: entry.rowNumber, lastSyncedFingerprint: entry.fingerprint, updatedAt: new Date() })
        .where(eq(googleSheetRowMappings.id, mapping.id));
    }
    changedWordIds.push(entry.wordId);
  }

  // Delete behavior: archive (default) never destroys learning data; delete is
  // opt-in and only used when explicitly configured.
  let rowsDeleted = 0;
  const activeSourceIds = new Set(createdDrafts.map((entry) => entry.sourceId).concat([...mappingBySourceId.keys()].filter((sourceId) => seenSourceIds.has(sourceId))));
  for (const mapping of mappings) {
    if (!mapping.wordId || activeSourceIds.has(mapping.sourceId) || mapping.deletedAt) continue;
    if (connection.deleteBehavior === "ignore") continue;
    if (connection.deleteBehavior === "delete") {
      await tx.delete(words).where(eq(words.id, mapping.wordId));
      await tx.delete(googleSheetRowMappings).where(eq(googleSheetRowMappings.id, mapping.id));
      changedWordIds.push(mapping.wordId);
    } else {
      await tx.update(googleSheetRowMappings).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(googleSheetRowMappings.id, mapping.id));
    }
    rowsDeleted += 1;
  }

  const stats: SyncStats = {
    rowsRead: parsedRows.length,
    rowsCreated: createdRows.length,
    rowsUpdated: updatedDrafts.length,
    rowsUnchanged: unchangedWordIds.size,
    rowsDeleted,
    rowsSkipped: invalidRows.length,
    duplicateCount,
    validationErrorCount: invalidRows.length,
    conflicts,
    invalidRows,
    idWrites,
    changedWordIds,
  };
  return { stats, writeIds: idWrites.length > 0 };
}
