import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { googleSheetConnections, googleSheetResources, googleSheetRowMappings, googleSheetSyncChannels, users, vocabSets, wordProgress, words } from "@/db/schema";
import { createFakeGoogleWorkspaceApi } from "./api";
import { replaceGoogleSheet } from "./replacement";
import { getGoogleSheetTemplate } from "./template";
import { fingerprintDbWord } from "./fingerprint";

const enabled = process.env.GOOGLE_SHEETS_TEST_DB === "1";

async function fixture() {
  const [admin] = await db.select().from(users).where(eq(users.username, "admin")).limit(1);
  const [set] = await db.insert(vocabSets).values({ name: "replacement-test", type: "ielts_vocab", createdBy: admin.id }).returning();
  const [word] = await db.insert(words).values({ setId: set.id, position: 1, term: "hello", meaning: "xin chào", example: "keep this" }).returning();
  const template = getGoogleSheetTemplate(set);
  const [connection] = await db.insert(googleSheetConnections).values({ setId: set.id, createdBy: admin.id, spreadsheetId: `old-${set.id}`, spreadsheetUrl: "u", spreadsheetName: "Old", sheetId: 0, sheetTitle: template.sheetTitle, rangeA1: "A:Z", templateType: template.templateType, aiEnrich: false, managedByLexora: true }).returning();
  const fingerprint = fingerprintDbWord(template, word);
  await db.insert(googleSheetRowMappings).values({ connectionId: connection.id, wordId: word.id, sourceId: "v_12345678", sheetRowNumber: 2, sourceFingerprint: fingerprint, lastSyncedFingerprint: fingerprint });
  await db.insert(googleSheetSyncChannels).values({ connectionId: connection.id, channelId: `old-channel-${set.id}`, resourceId: "old-resource", resourceUri: "u", status: "active" });
  await db.insert(wordProgress).values({ userId: admin.id, wordId: word.id, known: true, correctCount: 7, wrongCount: 2 });
  return { admin, set, word, connection, cleanup: () => db.delete(vocabSets).where(eq(vocabSets.id, set.id)) };
}

test("replacement commits one active watch and preserves word ID, source ID and learning data", { skip: !enabled }, async () => {
  const current = await fixture();
  const stopped: string[] = [];
  const api = createFakeGoogleWorkspaceApi({ stopWatchChannel: async channelId => { stopped.push(channelId); } });
  try {
    const result = await replaceGoogleSheet(current.connection.id, current.admin.id, current.connection.spreadsheetId, { api });
    const [connection] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, current.connection.id));
    assert.equal(connection.spreadsheetId, result.spreadsheetId);
    const channels = await db.select().from(googleSheetSyncChannels).where(eq(googleSheetSyncChannels.connectionId, connection.id));
    assert.equal(channels.filter(channel => channel.status === "active").length, 1);
    assert.deepEqual(stopped, [`old-channel-${current.set.id}`]);
    const [mapping] = await db.select().from(googleSheetRowMappings).where(eq(googleSheetRowMappings.connectionId, connection.id));
    assert.equal(mapping.wordId, current.word.id);
    assert.equal(mapping.sourceId, "v_12345678");
    const [progress] = await db.select().from(wordProgress).where(eq(wordProgress.wordId, current.word.id));
    assert.equal(progress.correctCount, 7);
    const resources = await db.select().from(googleSheetResources).where(eq(googleSheetResources.connectionId, connection.id));
    assert.deepEqual(resources.map(resource => resource.status).sort(), ["active", "replaced"]);
  } finally { await current.cleanup(); }
});

test("watch failure leaves old resource active and records candidate failure", { skip: !enabled }, async () => {
  const current = await fixture();
  const api = createFakeGoogleWorkspaceApi({ createWatchChannel: async () => { throw new Error("watch failed"); } });
  try {
    await assert.rejects(replaceGoogleSheet(current.connection.id, current.admin.id, current.connection.spreadsheetId, { api }), /watch failed/);
    const [connection] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, current.connection.id));
    assert.equal(connection.spreadsheetId, current.connection.spreadsheetId);
    assert.equal(connection.enabled, true);
    const [channel] = await db.select().from(googleSheetSyncChannels).where(eq(googleSheetSyncChannels.connectionId, connection.id));
    assert.equal(channel.status, "active");
    const [resource] = await db.select().from(googleSheetResources).where(eq(googleSheetResources.connectionId, connection.id));
    assert.equal(resource.status, "failed");
  } finally { await current.cleanup(); }
});

test("database edit during preparation aborts activation without retiring the old watch", { skip: !enabled }, async () => {
  const current = await fixture();
  const stopped: string[] = [];
  const api = createFakeGoogleWorkspaceApi({ stopWatchChannel: async id => { stopped.push(id); } });
  const createWatch = api.createWatchChannel;
  api.createWatchChannel = async options => {
    await db.update(words).set({ example: "concurrent edit" }).where(eq(words.id, current.word.id));
    return createWatch(options);
  };
  try {
    await assert.rejects(replaceGoogleSheet(current.connection.id, current.admin.id, current.connection.spreadsheetId, { api }), /Từ vựng đã thay đổi/);
    const [connection] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, current.connection.id));
    assert.equal(connection.spreadsheetId, current.connection.spreadsheetId);
    assert.equal(stopped.includes(`old-channel-${current.set.id}`), false);
    const [word] = await db.select().from(words).where(eq(words.id, current.word.id));
    assert.equal(word.example, "concurrent edit");
  } finally { await current.cleanup(); }
});
