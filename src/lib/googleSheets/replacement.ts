import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { googleSheetConnections, googleSheetResources, googleSheetRowMappings, googleSheetSyncChannels, googleSheetSyncRuns, vocabSets, words } from "@/db/schema";
import { writeAdminAudit } from "@/lib/adminAudit";
import { apiForUser, exportValuesForWord } from "./sheetLifecycle";
import { acquireConnectionLock, markSyncPending, releaseConnectionLock } from "./store";
import { GoogleSheetsError, safeGoogleErrorForLogs } from "./errors";
import { prepareReplacementCandidate } from "./replacementCandidate";
import { replacementIdentities } from "./replacementIdentity";
import { verifyReplacementExport } from "./replacementVerification";
import { getGoogleSheetTemplate } from "./template";
import { parseAiPromptOverrides } from "./aiFormula";
import { buildRangeA1, quoteSheetTitle } from "./spreadsheet";
import { fingerprintDbWord } from "./fingerprint";
import { hashChannelToken } from "./channelToken";
import { gridFromValuesRange } from "./parser";
import { runVocabularySync } from "./syncVocabulary";
import { syncIsPartial } from "./reliability";
import type { GoogleWorkspaceApi, WatchChannel } from "./api";

export async function replaceGoogleSheet(connectionId: number, actorUserId: number, confirmedSpreadsheetId: string, options?: { trashPrevious?: boolean; api?: GoogleWorkspaceApi }) {
  await acquireConnectionLock(connectionId, "replace");
  let candidateId: number | undefined;
  let candidateWatch: WatchChannel | undefined;
  let api: GoogleWorkspaceApi | undefined;
  let activated = false;
  try {
    const [connection] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, connectionId)).limit(1);
    if (!connection || connection.spreadsheetId !== confirmedSpreadsheetId) throw new GoogleSheetsError("Kết nối đã thay đổi. Hãy mở lại xác nhận.", "INVALID_SCHEMA", { status: 409 });
    if (options?.trashPrevious && !connection.managedByLexora) throw new GoogleSheetsError("Không được xóa Sheet bên ngoài.", "PERMISSION_DENIED", { status: 403 });
    const [set] = await db.select().from(vocabSets).where(eq(vocabSets.id, connection.setId)).limit(1);
    if (!set) throw new Error("Không tìm thấy bộ từ.");
    api = options?.api ?? await apiForUser(actorUserId);
    const template = getGoogleSheetTemplate(set);
    const wordRows = await db.select().from(words).where(eq(words.setId, set.id)).orderBy(asc(words.position), asc(words.id));
    const mappings = await db.select().from(googleSheetRowMappings).where(eq(googleSheetRowMappings.connectionId, connectionId));
    const oldChannels = await db.select().from(googleSheetSyncChannels).where(eq(googleSheetSyncChannels.connectionId, connectionId));
    const byWord = new Map(wordRows.map(word => [word.id, word]));
    const identities = replacementIdentities(wordRows.map(word => word.id), mappings);
    const rows = identities.map(identity => ({ sourceId: identity.sourceId, values: exportValuesForWord(template, byWord.get(identity.wordId)!) }));
    const candidate = await prepareReplacementCandidate({ api, template, title: `${set.name} – Google Sheet`, rows, aiEnrich: connection.aiEnrich, prompts: parseAiPromptOverrides(connection.aiPrompts),
      recordCreated: async created => {
        const [resource] = await db.insert(googleSheetResources).values({ ...created, connectionId, managedByLexora: true, status: "preparing" }).returning({ id: googleSheetResources.id });
        candidateId = resource.id;
      },
      recordWatch: async watch => {
        candidateWatch = watch;
        await db.update(googleSheetResources).set({ channelId: watch.channelId, resourceId: watch.resourceId, updatedAt: new Date() }).where(eq(googleSheetResources.id, candidateId!));
      },
    });
    const values = await api.readValues(candidate.created.spreadsheetId, `${quoteSheetTitle(candidate.created.sheetTitle)}!A:Z`);
    verifyReplacementExport(template, values, rows);
    await db.transaction(async tx => {
      await tx.select({ id: vocabSets.id }).from(vocabSets).where(eq(vocabSets.id, set.id)).for("update");
      const freshWords = await tx.select().from(words).where(eq(words.setId, set.id)).orderBy(asc(words.position), asc(words.id)).for("update");
      if (JSON.stringify(freshWords) !== JSON.stringify(wordRows)) throw new GoogleSheetsError("Từ vựng đã thay đổi trong lúc chuẩn bị. Sheet cũ vẫn giữ nguyên; hãy thử lại.", "INVALID_SCHEMA", { status: 409 });
      const freshMappings = await tx.select().from(googleSheetRowMappings).where(eq(googleSheetRowMappings.connectionId, connectionId));
      if (JSON.stringify([...freshMappings].sort((left, right) => left.id - right.id)) !== JSON.stringify([...mappings].sort((left, right) => left.id - right.id))) throw new Error("Liên kết dòng đã thay đổi trong lúc chuẩn bị.");
      for (const [index, identity] of identities.entries()) {
        const fingerprint = fingerprintDbWord(template, byWord.get(identity.wordId)!);
        await tx.insert(googleSheetRowMappings).values({ connectionId, wordId: identity.wordId, sourceId: identity.sourceId, sheetRowNumber: index + 2, sourceFingerprint: fingerprint, lastSyncedFingerprint: fingerprint })
          .onConflictDoUpdate({ target: [googleSheetRowMappings.connectionId, googleSheetRowMappings.sourceId], set: { sheetRowNumber: index + 2, sourceFingerprint: fingerprint, lastSyncedFingerprint: fingerprint, updatedAt: new Date() } });
      }
      const outcome = await runVocabularySync({ ...connection, spreadsheetId: candidate.created.spreadsheetId, sheetTitle: candidate.created.sheetTitle }, gridFromValuesRange(values), tx);
      if (syncIsPartial(outcome.stats) || outcome.stats.rowsCreated || outcome.stats.rowsUpdated || outcome.stats.rowsDeleted || outcome.stats.idWrites.length) throw new Error("Đồng bộ kiểm tra Sheet mới chưa khớp hoàn toàn. Không thay Sheet cũ.");
      const now = new Date();
      await tx.insert(googleSheetResources).values({ connectionId, spreadsheetId: connection.spreadsheetId, spreadsheetUrl: connection.spreadsheetUrl, spreadsheetName: connection.spreadsheetName, sheetId: connection.sheetId, sheetTitle: connection.sheetTitle, managedByLexora: connection.managedByLexora, status: "replaced" })
        .onConflictDoUpdate({ target: googleSheetResources.spreadsheetId, set: { status: "replaced", updatedAt: now } });
      await tx.update(googleSheetConnections).set({ ...candidate.created, createdBy: actorUserId, managedByLexora: true, externalState: "accessible", externalDeletedAt: null, lastVerifiedAt: now, rangeA1: buildRangeA1(candidate.created.sheetTitle, template.fields.length, rows.length + 1), enabled: true, status: "connected", lastSyncedAt: now, lastSuccessfulSyncAt: now, lastError: null, lastErrorAt: null, updatedAt: now }).where(eq(googleSheetConnections.id, connectionId));
      await tx.update(googleSheetSyncChannels).set({ status: "stopped", updatedAt: now }).where(eq(googleSheetSyncChannels.connectionId, connectionId));
      await tx.insert(googleSheetSyncChannels).values({ connectionId, channelId: candidate.watch.channelId, resourceId: candidate.watch.resourceId, resourceUri: candidate.watch.resourceUri, expirationAt: candidate.watch.expirationAt, channelTokenHash: hashChannelToken(candidate.watch.channelToken!), status: "active" });
      await tx.update(googleSheetResources).set({ status: "active", updatedAt: now }).where(eq(googleSheetResources.id, candidateId!));
      await tx.insert(googleSheetSyncRuns).values({ connectionId, triggerType: "initial", status: "success", finishedAt: now, rowsRead: outcome.stats.rowsRead, rowsUnchanged: outcome.stats.rowsUnchanged, metadata: JSON.stringify({ replacement: true, previousSpreadsheetId: connection.spreadsheetId, spreadsheetId: candidate.created.spreadsheetId }) });
      await writeAdminAudit({ actorUserId, action: "google_sheet.replace", resourceType: "google_sheet_connection", resourceId: connectionId, metadata: { previousSpreadsheetId: connection.spreadsheetId, spreadsheetId: candidate.created.spreadsheetId, wordsPreserved: rows.length } }, tx);
    });
    activated = true;
    let cleanupPending = false;
    try { await markSyncPending(connectionId, "replacement_catch_up"); }
    catch { cleanupPending = true; }
    for (const channel of oldChannels) {
      try { if (api.stopWatchChannel) await api.stopWatchChannel(channel.channelId, channel.resourceId); else cleanupPending = true; }
      catch { cleanupPending = true; }
    }
    if (options?.trashPrevious) {
      try {
        if (!api.trashSpreadsheet) throw new Error("Trash unavailable");
        await api.trashSpreadsheet(connection.spreadsheetId);
        await db.update(googleSheetResources).set({ status: "trashed", updatedAt: new Date() }).where(eq(googleSheetResources.spreadsheetId, connection.spreadsheetId));
      } catch { cleanupPending = true; }
    }
    return { connectionId, spreadsheetId: candidate.created.spreadsheetId, spreadsheetUrl: candidate.created.spreadsheetUrl, cleanupPending, preservedWords: rows.length };
  } catch (error) {
    if (!activated && candidateId) {
      await db.update(googleSheetResources).set({ status: "failed", error: safeGoogleErrorForLogs(error), updatedAt: new Date() }).where(eq(googleSheetResources.id, candidateId));
      if (candidateWatch && api?.stopWatchChannel) await api.stopWatchChannel(candidateWatch.channelId, candidateWatch.resourceId).catch(() => {});
    }
    throw error;
  } finally {
    await releaseConnectionLock(connectionId);
  }
}
