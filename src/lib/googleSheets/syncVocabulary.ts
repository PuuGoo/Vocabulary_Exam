import { asc, eq } from "drizzle-orm";
import { blocksBulkUpdate, bulkDeletionThresholds, deletionReviewFingerprint, type DeletionReview, type UpdateReview } from "./bulkReview";
import { GoogleSheetsError } from "./errors";
import { db } from "@/db";
import { googleSheetConnections, googleSheetRowMappings, vocabSets, words } from "@/db/schema";
import { gridFromValuesRange, mapHeadersToFieldKeys, parseSheetGrid, type SheetGrid } from "@/lib/googleSheets/parser";
import { getGoogleSheetTemplate, SOURCE_ID_HEADER, type GoogleSheetTemplate } from "@/lib/googleSheets/template";
import { aiColumnsForTemplate, buildAiColumnFormulas, aiColumnLetters, parseAiPromptOverrides } from "@/lib/googleSheets/aiFormula";
import { changedFingerprintFields, fingerprintDbWord, fingerprintSheetValues } from "@/lib/googleSheets/fingerprint";
import { generateSourceId, readSourceIdCell } from "@/lib/googleSheets/identity";
import { draftToWordInsert, parseVocabularyRows, type ParsedWordDraft } from "@/lib/vocabImport/parse";
import { appendWords, lockVocabularySets } from "@/lib/wordOrder.server";
import { importWordKey } from "@/lib/importDedup";
import { blocksBulkDeletion, matchingResolution, type ConflictDetail, type SyncRequest, type WordChange } from "./reliability";

export type SyncConnection = {
  id: number;
  setId: number;
  spreadsheetId: string;
  sheetTitle: string;
  deleteBehavior: string;
  conflictPolicy?: string;
  status: string;
  enabled: boolean;
  /** Raw JSON from the DB column; parsed once into prompt overrides below. */
  aiPrompts?: string | null;
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
  /**
   * Structured conflicts. The UI renders sourceId / word / fieldsChanged
   * directly, so nothing has to be parsed back out of a message string.
   */
  conflicts: ConflictDetail[];
  changes: WordChange[];
  deletionBlocked: number;
  deletionReview?: DeletionReview;
  updateBlocked?: number;
  updateReview?: UpdateReview;
  invalidRows: Array<{ rowNumber: number; message: string }>;
  idWrites: Array<{ rowNumber: number; sourceId: string }>;
  changedWordIds: number[];
  unarchivedWordIds: number[];
};

export type SyncEngineResult = {
  stats: SyncStats;
  writeIds: boolean;
  /**
   * Google Sheets AI formulas for rows the Sheet just added. Lexora only relays
   * them; Google Sheets generates the values and the webhook + sync path
   * persists them. Never an AI API call from Lexora.
   */
  aiFormulaWrites?: Array<{ rowNumber: number; cells: Array<{ letter: string; formula: string }> }>;
};

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
  options?: SyncRequest,
): Promise<SyncEngineResult> {
  await lockVocabularySets(tx, [connection.setId]);
  const [set] = await tx.select().from(vocabSets).where(eq(vocabSets.id, connection.setId)).limit(1);
  if (!set) throw new Error("Vocabulary set not found");
  const template = getGoogleSheetTemplate(set);
  // Admin-authored instruction text for the =AI() formulas planted below.
  // Falls back to the built-in defaults when the column is NULL.
  const aiPromptOverrides = parseAiPromptOverrides(connection.aiPrompts);
  const parsedRows = parseSheetGrid(grid, template);
  const [existingWords, mappings] = await Promise.all([
    tx.select().from(words).where(eq(words.setId, set.id)).orderBy(asc(words.position), asc(words.id)).for("update"),
    tx.select().from(googleSheetRowMappings).where(eq(googleSheetRowMappings.connectionId, connection.id)),
  ]);

  const mappingBySourceId = new Map(mappings.map((mapping) => [mapping.sourceId, mapping]));
  const reviewFingerprint = deletionReviewFingerprint({ connectionId: connection.id, spreadsheetId: connection.spreadsheetId, deleteBehavior: connection.deleteBehavior, grid, words: existingWords, mappings: [...mappings].sort((left, right) => left.id - right.id) });
  if (options?.deletionApproval && options.deletionApproval !== reviewFingerprint) {
    throw new GoogleSheetsError("Dữ liệu đã thay đổi sau khi xem xét. Hãy đồng bộ lại và kiểm tra danh sách mới.", "INVALID_SCHEMA", { status: 409, retryable: false });
  }
  if (options?.updateApproval && options.updateApproval !== reviewFingerprint) throw new GoogleSheetsError("Dữ liệu đã thay đổi sau khi xem xét. Hãy đồng bộ lại trước khi xác nhận cập nhật.", "INVALID_SCHEMA", { status: 409, retryable: false });
  const mappingByWordId = new Map(mappings.filter((mapping) => mapping.wordId != null).map((mapping) => [mapping.wordId as number, mapping]));
  const wordById = new Map(existingWords.map((word) => [word.id, word]));
  const wordsByKey = new Map<string, typeof existingWords>();
  for (const word of existingWords) {
    const key = importWordKey(word, set.type);
    wordsByKey.set(key, [...(wordsByKey.get(key) ?? []), word]);
  }

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
  // New rows may still carry raw AI instructions in the AI-enabled columns.
  // Those are returned (not persisted) so the caller can plant the formulas
  // into the Sheet for the rows Google Sheets should generate. Lexora itself
  // never calls an AI API: Google Sheets owns the generation.
  const aiFormulasByRow = new Map<number, Array<{ letter: string; formula: string }>>();

  const idWrites: Array<{ rowNumber: number; sourceId: string }> = [];
  const createdDrafts: Array<{ rowNumber: number; sourceId: string; draft: ParsedWordDraft; fingerprint: string }> = [];
  const updatedDrafts: Array<{ rowNumber: number; wordId: number; draft: ParsedWordDraft; fingerprint: string }> = [];
  const conflicts: ConflictDetail[] = [];
  const changes: WordChange[] = [];
  const unchangedWordIds = new Set<number>();
  const unarchivedWordIds = new Set<number>();
  const seenSourceIds = new Set<string>();
  const claimedWordIds = new Set<number>();
  const appliedResolutions = new Set<string>();

  // Spec item 5: user-entered data always wins. AI formulas are only planted
  // into cells the admin has not filled in yet. Without this guard a manual
  // Meaning / IPA / Example edit would be overwritten by Google Sheets on the
  // next sync, which is exactly what the spec forbids.
  function pushAiCellsForBlankCells(rowNumber: number, sourceValues: Record<string, string>, lettersByPlan: Map<string, string>) {
    for (const plan of aiColumnsForTemplate(template.templateType)) {
      const letter = lettersByPlan.get(plan.key);
      if (!letter) continue;
      if ((sourceValues[plan.key] ?? "").trim() !== "") continue;
      const [formula] = buildAiColumnFormulas(template, "AI", plan, 1, rowNumber, aiPromptOverrides);
      if (!formula) continue;
      const cells = aiFormulasByRow.get(rowNumber) ?? [];
      cells.push({ letter, formula });
      aiFormulasByRow.set(rowNumber, cells);
    }
  }

  for (const row of parsedRows) {
    if (!Object.values(row.values).some((value) => value !== "" && value != null)) continue; // blank row
    const resolvedSourceId = readSourceIdCell(row.sourceId);
    if (row.sourceId.trim() && !resolvedSourceId) throw new GoogleSheetsError("ID dòng không hợp lệ. Hãy sửa ID trước khi đồng bộ.", "INVALID_SCHEMA", { retryable: false });
    if (resolvedSourceId) seenSourceIds.add(`present:${resolvedSourceId}`);
    const draft = draftByRowNumber.get(row.rowNumber);
    if (!draft) {
      // The row is not valid vocabulary yet (Word or Meaning is still blank).
      // It is skipped by the parser, so no word/mapping is created - but the
      // Sheet-side AI formulas must still be planted for it. Without this the
      // admin would see an empty AI column forever: the row would never match
      // a draft, the formula write-back would never fire, and Google Sheets
      // would have no =AI(...) instruction to run when they type the word.
      //
      // Identity is left alone: source id, STT and the mapping table are not
      // written for an incomplete row. Only the AI formula cells are filled.
      pushAiCellsForBlankCells(row.rowNumber, row.values, aiColumnLetters(template, template.templateType));
      continue;
    }
    const identityKey = resolvedSourceId || importWordKey({ term: draft.term, v1: draft.v1, v2: draft.v2, v3: draft.v3 }, set.type);
    if (seenSourceIds.has(identityKey)) { duplicateCount += 1; continue; }
    seenSourceIds.add(identityKey);

    let mapping = resolvedSourceId ? mappingBySourceId.get(resolvedSourceId) : undefined;
    const fallbackKey = importWordKey({ term: draft.term, v1: draft.v1, v2: draft.v2, v3: draft.v3 }, set.type);
    const fallbackMatches = wordsByKey.get(fallbackKey) ?? [];
    if (!mapping && fallbackMatches.length > 1) throw new GoogleSheetsError("Có nhiều từ cùng danh tính. Hãy xử lý trùng trước khi đồng bộ.", "INVALID_SCHEMA", { retryable: false });
    const fallbackWord = fallbackMatches[0];
    const fingerprint = fingerprintSheetValues(template, { ...row.values } as Record<string, string>);
    const word = mapping?.wordId != null ? wordById.get(mapping.wordId) : fallbackWord;
    if (word && claimedWordIds.has(word.id)) throw new GoogleSheetsError("Nhiều dòng đang trỏ tới cùng một từ. Hãy kiểm tra ID và dòng trùng.", "INVALID_SCHEMA", { retryable: false });
    if (word) claimedWordIds.add(word.id);

    if (word && !mapping) {
      const existingMapping = mappingByWordId.get(word.id);
      if (existingMapping && resolvedSourceId && existingMapping.sourceId !== resolvedSourceId) {
        throw new GoogleSheetsError("ID trên Sheet khác ID đã liên kết với từ. Không tự thay đổi danh tính dòng.", "INVALID_SCHEMA", { retryable: false });
      }
      if (existingMapping) {
        mapping = existingMapping;
        if (!resolvedSourceId) idWrites.push({ rowNumber: row.rowNumber, sourceId: mapping.sourceId });
      } else {
        const sourceId = resolvedSourceId || generateSourceId(new Set([...mappingBySourceId.keys(), ...seenSourceIds]));
        const baseline = fingerprintDbWord(template, word);
        const [createdMapping] = await tx.insert(googleSheetRowMappings).values({ connectionId: connection.id, wordId: word.id, sourceId, sheetRowNumber: row.rowNumber, sourceFingerprint: baseline, lastSyncedFingerprint: baseline }).returning();
        mapping = createdMapping;
        mappings.push(createdMapping);
        mappingBySourceId.set(sourceId, createdMapping);
        mappingByWordId.set(word.id, createdMapping);
        if (!resolvedSourceId) idWrites.push({ rowNumber: row.rowNumber, sourceId });
      }
      seenSourceIds.add(mapping.sourceId);
    }

    if (!word) {
      const sourceId = resolvedSourceId || generateSourceId(new Set(seenSourceIds));
      if (!resolvedSourceId) idWrites.push({ rowNumber: row.rowNumber, sourceId });
      createdDrafts.push({ rowNumber: row.rowNumber, sourceId, draft, fingerprint });
      // Collect the AI formulas for this new row so the caller can write them
      // back to the Sheet (one formula per AI-enabled column, one row only).
      pushAiCellsForBlankCells(row.rowNumber, row.values, aiColumnLetters(template, template.templateType));
      continue;
    }

    // A row that reappears in the Sheet is un-archived. Without this the mapping
    // would keep deletedAt forever, so the word could never come back.
    if (mapping?.deletedAt) {
      await tx.update(googleSheetRowMappings).set({ deletedAt: null, updatedAt: new Date() }).where(eq(googleSheetRowMappings.id, mapping.id));
      mapping.deletedAt = null;
      unarchivedWordIds.add(word.id);
    }

    // DB side: project the word through the SAME template mapping used on
    // export, then fingerprint. Comparing a raw DB row against a Sheet-shaped
    // fingerprint is what produced false conflicts for DB-only columns.
    const dbValues = templateValuesForWord(template, word);
    const dbFingerprint = fingerprintDbWord(template, dbValues);
    const lastSynced = mapping?.lastSyncedFingerprint ?? null;
    const resolution = matchingResolution(options?.resolutions, mapping?.sourceId ?? "", fingerprint, dbFingerprint);
    const requested = options?.resolutions?.find((item) => item.sourceId === mapping?.sourceId);
    if (requested && !resolution) throw new Error("Dữ liệu đã thay đổi từ lúc mở so sánh. Hãy đồng bộ lại và kiểm tra trước khi xác nhận.");
    if (requested && resolution) appliedResolutions.add(requested.sourceId);
    if (resolution === "website" && mapping) {
      if (connection.conflictPolicy === "sheet") throw new Error("Hãy tắt chế độ Sheet là nguồn chính trước khi giữ bản website.");
      await tx.update(googleSheetRowMappings).set({ sourceFingerprint: fingerprint, lastSyncedFingerprint: dbFingerprint, updatedAt: new Date() }).where(eq(googleSheetRowMappings.id, mapping.id));
      changes.push({ wordId: word.id, sourceId: mapping.sourceId, rowNumber: row.rowNumber, fieldsChanged: changedFingerprintFields(template, dbValues, row.values), word: String(word.term ?? word.v1 ?? ""), action: "keep_website", before: dbValues, after: dbValues });
      unchangedWordIds.add(word.id);
      continue;
    }
    if (connection.conflictPolicy !== "sheet" && !resolution && mapping?.sourceFingerprint === fingerprint && lastSynced === dbFingerprint) { unchangedWordIds.add(word.id); continue; }
    if (dbFingerprint === fingerprint) {
      if (mapping && lastSynced !== fingerprint) await tx.update(googleSheetRowMappings).set({ sourceFingerprint: fingerprint, lastSyncedFingerprint: fingerprint, updatedAt: new Date() }).where(eq(googleSheetRowMappings.id, mapping.id));
      unchangedWordIds.add(word.id); continue;
    }
    // Conflict requires BOTH sides to have moved since the last sync:
    // DB != lastSynced AND Sheet != lastSynced. When the DB still equals
    // lastSynced, the Sheet is simply the side that changed - that is the
    // normal Google-Sheet-edits-the-vocabulary workflow, so it is an UPDATE.
    if (lastSynced && dbFingerprint !== lastSynced && fingerprint !== lastSynced && connection.conflictPolicy !== "sheet" && resolution !== "sheet") {
      const fieldsChanged = changedFingerprintFields(template, dbValues, { ...row.values } as Record<string, string>);
      conflicts.push({
        rowNumber: row.rowNumber,
        sourceId: mapping?.sourceId ?? resolvedSourceId ?? "",
        word: String(row.values.term ?? row.values.v1 ?? ""),
        fieldsChanged,
        sheetFingerprint: fingerprint, dbFingerprint, before: dbValues, after: row.values,
        message: `Cột ${SOURCE_ID_HEADER}=${mapping?.sourceId} đã bị sửa trực tiếp trong Lexora; Sheet và DB đã phân kỳ.`,
      });
      continue;
    }
    updatedDrafts.push({ rowNumber: row.rowNumber, wordId: word.id, draft, fingerprint });
  }

  if ((options?.resolutions ?? []).some((item) => !appliedResolutions.has(item.sourceId))) throw new Error("Dòng cần xử lý không còn hợp lệ hoặc đã bị xóa khỏi Sheet. Hãy đồng bộ lại.");
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

  const updateBlocked = !options?.updateApproval && blocksBulkUpdate(existingWords.length, updatedDrafts.length) ? updatedDrafts.length : 0;
  const proposedUpdates: WordChange[] = updatedDrafts.map(entry => {
    const previous = wordById.get(entry.wordId)!;
    const before = templateValuesForWord(template, previous);
    const after = templateValuesForWord(template, draftToWordInsert(entry.draft));
    return { wordId: entry.wordId, sourceId: mappingByWordId.get(entry.wordId)?.sourceId, rowNumber: entry.rowNumber, fieldsChanged: changedFingerprintFields(template, before, after), word: String(previous.term ?? previous.v1 ?? ""), action: "update", before, after };
  });
  const updateReview: UpdateReview | undefined = updateBlocked ? { fingerprint: reviewFingerprint, activeCount: existingWords.length, changedCount: updateBlocked, rows: proposedUpdates } : undefined;
  for (const entry of updateBlocked ? [] : updatedDrafts) {
    const previous = wordById.get(entry.wordId)!;
    const before = templateValuesForWord(template, previous);
    const after = templateValuesForWord(template, draftToWordInsert(entry.draft));
    changes.push({ wordId: entry.wordId, sourceId: mappingByWordId.get(entry.wordId)?.sourceId, rowNumber: entry.rowNumber, fieldsChanged: changedFingerprintFields(template, before, after), word: String(previous.term ?? previous.v1 ?? ""), action: "update", before, after });
    const draftValues = draftToWordInsert(entry.draft);
    const patch = Object.fromEntries(template.fields.filter((field) => !field.displayOnly && field.key !== SOURCE_ID_HEADER).map((field) => [field.key, draftValues[field.key as keyof typeof draftValues]]));
    await tx.update(words).set(patch).where(eq(words.id, entry.wordId));
    const mapping = mappingByWordId.get(entry.wordId);
    if (mapping) {
      await tx.update(googleSheetRowMappings)
        .set({ sheetRowNumber: entry.rowNumber, sourceFingerprint: entry.fingerprint, lastSyncedFingerprint: entry.fingerprint, updatedAt: new Date() })
        .where(eq(googleSheetRowMappings.id, mapping.id));
    }
    changedWordIds.push(entry.wordId);
  }

  // Delete behavior: archive (default) never destroys learning data; delete is
  // opt-in and only used when explicitly configured.
  let rowsDeleted = 0;
  const activeSourceIds = new Set(createdDrafts.map((entry) => entry.sourceId).concat([...mappingBySourceId.keys()].filter((sourceId) => seenSourceIds.has(sourceId))));
  for (const mapping of mappings) if (seenSourceIds.has(`present:${mapping.sourceId}`)) activeSourceIds.add(mapping.sourceId);
  const activeMappings = mappings.filter((mapping) => mapping.wordId && !mapping.deletedAt);
  const missing = activeMappings.filter((mapping) => !activeSourceIds.has(mapping.sourceId));
  const requiresDeletionReview = connection.deleteBehavior !== "ignore" && blocksBulkDeletion(activeMappings.length, missing.length, bulkDeletionThresholds());
  const deletionBlocked = requiresDeletionReview && !options?.deletionApproval ? missing.length : 0;
  const deletionReview: DeletionReview | undefined = deletionBlocked ? {
    fingerprint: reviewFingerprint,
    activeCount: activeMappings.length,
    missingCount: missing.length,
    rows: missing.map(mapping => ({ sourceId: mapping.sourceId, wordId: mapping.wordId!, word: String(wordById.get(mapping.wordId!)?.term ?? wordById.get(mapping.wordId!)?.v1 ?? "") })),
  } : undefined;
  for (const mapping of mappings) {
    if (deletionBlocked) break;
    if (!mapping.wordId || activeSourceIds.has(mapping.sourceId) || mapping.deletedAt) continue;
    if (connection.deleteBehavior === "ignore") continue;
    const previous = wordById.get(mapping.wordId);
    if (previous) changes.push({ wordId: mapping.wordId, sourceId: mapping.sourceId, rowNumber: mapping.sheetRowNumber, fieldsChanged: Object.keys(templateValuesForWord(template, previous)), word: String(previous.term ?? previous.v1 ?? ""), action: connection.deleteBehavior === "delete" ? "delete" : "archive", before: templateValuesForWord(template, previous), after: {} });
    await tx.update(googleSheetRowMappings).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(googleSheetRowMappings.id, mapping.id));
    changedWordIds.push(mapping.wordId);
    rowsDeleted += 1;
  }

  if (deletionReview || updateReview) {
    const finalWords = await tx.select().from(words).where(eq(words.setId, set.id)).orderBy(asc(words.position), asc(words.id)).for("update");
    const finalMappings = await tx.select().from(googleSheetRowMappings).where(eq(googleSheetRowMappings.connectionId, connection.id));
    const projectedGrid = { headers: [...grid.headers], rows: grid.rows.map(row => [...row]) };
    const idColumn = [...mapHeadersToFieldKeys(grid.headers, template)].find(([, key]) => key === SOURCE_ID_HEADER)?.[0];
    if (idColumn !== undefined) for (const write of idWrites) projectedGrid.rows[write.rowNumber - 2][idColumn] = write.sourceId;
    const finalFingerprint = deletionReviewFingerprint({ connectionId: connection.id, spreadsheetId: connection.spreadsheetId, deleteBehavior: connection.deleteBehavior, grid: projectedGrid, words: finalWords, mappings: [...finalMappings].sort((left, right) => left.id - right.id) });
    if (deletionReview) deletionReview.fingerprint = finalFingerprint;
    if (updateReview) updateReview.fingerprint = finalFingerprint;
  }

  const stats: SyncStats = {
    rowsRead: parsedRows.length,
    rowsCreated: createdRows.length,
    rowsUpdated: updateBlocked ? 0 : updatedDrafts.length,
    rowsUnchanged: unchangedWordIds.size,
    rowsDeleted,
    rowsSkipped: invalidRows.length,
    duplicateCount,
    validationErrorCount: invalidRows.length,
    conflicts,
    changes,
    deletionBlocked,
    deletionReview,
    updateBlocked,
    updateReview,
    invalidRows,
    idWrites,
    changedWordIds,
    unarchivedWordIds: [...unarchivedWordIds],
  };
  return {
    stats,
    writeIds: idWrites.length > 0,
    // Row-scoped AI formulas for newly created rows, ready to be written back
    // to the Sheet. They are pure Google Sheets instructions; no AI API call.
    aiFormulaWrites: [...aiFormulasByRow.entries()].map(([rowNumber, cells]) => ({ rowNumber, cells })),
  };
}

/**
 * Project a database word onto exactly the columns this template exposes.
 *
 * This is the single normalization used for every DB-side fingerprint, so a
 * column the Sheet does not have (alternateTerm, pronunciation, classifier for
 * an IELTS set) can never make the DB look "changed since last sync".
 */
function templateValuesForWord(template: GoogleSheetTemplate, word: Record<string, unknown>): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of template.fields) {
    if (field.key === SOURCE_ID_HEADER) continue;
    const value = word[field.key];
    values[field.key] = value == null ? "" : String(value);
  }
  return values;
}
