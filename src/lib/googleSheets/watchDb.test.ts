import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { googleSheetConnections, googleSheetSyncChannels, users, vocabSets } from "@/db/schema";
import { storeGoogleToken, clearGoogleToken } from "./auth";
import { createFakeGoogleWorkspaceApi } from "./api";
import { renewGoogleWatchChannels } from "./watch";

test("scheduled renewal replaces idle expiring watches but retains delivery when Google fails", { skip: process.env.GOOGLE_SHEETS_TEST_DB !== "1" }, async () => {
  const [owner] = await db.insert(users).values({ username: "watch-renewal-owner", displayName: "Watch test", passwordHash: "test-only", role: "admin" }).returning();
  const [set] = await db.insert(vocabSets).values({ name: "watch-renewal-test", type: "ielts_vocab", createdBy: owner.id }).returning();
  try {
    await storeGoogleToken(owner.id, { access_token: "fake-access", refresh_token: "fake-refresh" });
    const [connection] = await db.insert(googleSheetConnections).values({ setId: set.id, createdBy: owner.id, spreadsheetId: `watch-${set.id}`, spreadsheetUrl: "u", spreadsheetName: "n", sheetId: 0, sheetTitle: "Words", rangeA1: "A:Z", templateType: "ielts_vocab" }).returning();
    const [original] = await db.insert(googleSheetSyncChannels).values({ connectionId: connection.id, channelId: `old-${set.id}`, resourceId: "resource", resourceUri: "u", channelTokenHash: "digest", expirationAt: new Date(Date.now() + 5 * 3600000), status: "active" }).returning();
    const stopped: string[] = [];
    const api = createFakeGoogleWorkspaceApi({ stopWatchChannel: async channelId => { stopped.push(channelId); } });
    const first = await renewGoogleWatchChannels(() => api);
    assert.equal(first.find(item => item.connectionId === connection.id)?.renewed, true);
    assert.deepEqual(stopped, [original.channelId]);
    const [renewed] = await db.select().from(googleSheetSyncChannels).where(eq(googleSheetSyncChannels.id, original.id));
    assert.notEqual(renewed.channelId, original.channelId);
    assert.equal(renewed.status, "active");
    assert.ok(renewed.channelTokenHash);
    const second = await renewGoogleWatchChannels(() => api);
    assert.equal(second.find(item => item.connectionId === connection.id)?.skipped, "not_expiring_soon");
    await db.update(googleSheetSyncChannels).set({ expirationAt: new Date(Date.now() + 3600000) }).where(eq(googleSheetSyncChannels.id, original.id));
    const failingApi = createFakeGoogleWorkspaceApi({ createWatchChannel: async () => { throw new Error("Google unavailable"); } });
    const failed = await renewGoogleWatchChannels(() => failingApi);
    assert.equal(failed.find(item => item.connectionId === connection.id)?.error, "Google unavailable");
    const [retained] = await db.select().from(googleSheetSyncChannels).where(eq(googleSheetSyncChannels.id, original.id));
    assert.equal(retained.channelId, renewed.channelId);
    assert.equal(retained.status, "active");
  } finally {
    await db.delete(vocabSets).where(eq(vocabSets.id, set.id));
    await clearGoogleToken(owner.id);
    await db.delete(users).where(eq(users.id, owner.id));
  }
});
