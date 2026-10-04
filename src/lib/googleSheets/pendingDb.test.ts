import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { googleSheetConnections, googleSheetSyncChannels, googleSheetSyncPending, vocabSets } from "@/db/schema";
import { clearSyncPending, recordNotificationState } from "./store";

test("PostgreSQL accepts large webhook sequences and atomically rejects duplicate delivery", { skip: process.env.GOOGLE_SHEETS_TEST_DB !== "1" }, async () => {
  const [set] = await db.insert(vocabSets).values({ name: "notification-sequence-test", type: "ielts_vocab" }).returning();
  try {
    const [connection] = await db.insert(googleSheetConnections).values({ setId: set.id, spreadsheetId: `sequence-${set.id}`, spreadsheetUrl: "u", spreadsheetName: "n", sheetId: 0, sheetTitle: "Words", rangeA1: "A:Z", templateType: "ielts_vocab" }).returning();
    const channelId = `sequence-${set.id}`;
    await db.insert(googleSheetSyncChannels).values({ connectionId: connection.id, channelId, resourceId: "resource", resourceUri: "https://example.invalid/sheet", status: "active" });
    const sequence = 2 ** 40;
    const results = await Promise.all([
      recordNotificationState(channelId, "resource", sequence, "webhook"),
      recordNotificationState(channelId, "resource", sequence, "webhook"),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(await recordNotificationState(channelId, "resource", sequence - 1, "webhook"), null);
    assert.equal(await recordNotificationState(channelId, "wrong-resource", sequence + 1, "webhook"), null);
    const advanced = await recordNotificationState(channelId, "resource", Number.MAX_SAFE_INTEGER, "webhook");
    assert.equal(advanced?.lastMessageNumber, Number.MAX_SAFE_INTEGER);
    const [pending] = await db.select().from(googleSheetSyncPending).where(eq(googleSheetSyncPending.connectionId, connection.id));
    assert.equal(pending.pending, true);
  } finally {
    await db.delete(vocabSets).where(eq(vocabSets.id, set.id));
  }
});

test("PostgreSQL clears only notifications no newer than the completed read", { skip: process.env.GOOGLE_SHEETS_TEST_DB !== "1" }, async () => {
  const [set] = await db.insert(vocabSets).values({ name: "pending-cutoff-test", type: "ielts_vocab" }).returning();
  try {
    const [connection] = await db.insert(googleSheetConnections).values({ setId: set.id, spreadsheetId: `pending-${set.id}`, spreadsheetUrl: "u", spreadsheetName: "n", sheetId: 0, sheetTitle: "Words", rangeA1: "A:Z", templateType: "ielts_vocab" }).returning();
    const readStartedAt = new Date("2026-01-01T00:00:00Z");
    await db.insert(googleSheetSyncPending).values({ connectionId: connection.id, pending: true, pendingAt: new Date(readStartedAt.getTime() + 1000) });
    await clearSyncPending(connection.id, readStartedAt);
    const [newer] = await db.select().from(googleSheetSyncPending).where(eq(googleSheetSyncPending.connectionId, connection.id));
    assert.equal(newer.pending, true);
    await clearSyncPending(connection.id, new Date(readStartedAt.getTime() + 1000));
    const [consumed] = await db.select().from(googleSheetSyncPending).where(eq(googleSheetSyncPending.connectionId, connection.id));
    assert.equal(consumed.pending, false);
    assert.equal(consumed.pendingAt, null);
  } finally {
    await db.delete(vocabSets).where(eq(vocabSets.id, set.id));
  }
});
