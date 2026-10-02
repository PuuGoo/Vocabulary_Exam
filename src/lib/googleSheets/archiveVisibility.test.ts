import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { googleSheetRowMappings, words } from "@/db/schema";
import { gridFromValuesRange } from "@/lib/googleSheets/parser";
import { getGoogleSheetTemplate, SOURCE_ID_HEADER } from "@/lib/googleSheets/template";
import { runVocabularySync } from "@/lib/googleSheets/syncVocabulary";
import { visibleWordsFilter, visibleWordsJoin } from "@/lib/googleSheets/visibility";

/**
 * Regression: rows deleted from the Google Sheet are archived to protect
 * learning data, but the admin must stop seeing them - and a row that comes
 * back must be un-archived.
 *
 * Bug (reported): deleting 3 of 5 rows in the Sheet left the admin list at 5,
 * because the read paths only ran `SELECT * FROM words` and never consulted
 * mapping.deleted_at. A second bug meant the mapping could never be
 * un-archived when the row reappeared.
 */

type Fixture = {
  connectionId: number;
  setId: number;
  wordIds: number[];
  sourceIds: string[];
  set: { id: number; type: string; languageCode: string };
};

async function seed(): Promise<Fixture> {
  const { vocabSets, googleSheetConnections } = await import("@/db/schema");
  const { eq: eq2, asc: asc2 } = await import("drizzle-orm");
  const { computeWordFingerprint } = await import("@/lib/googleSheets/fingerprint");
  const { generateSourceId } = await import("@/lib/googleSheets/identity");

  const [admin] = await db.select().from((await import("@/db/schema")).users).where(eq2((await import("@/db/schema")).users.username, "admin")).limit(1);
  const [set] = await db.insert(vocabSets).values({
    name: `__arch__${Date.now()}`, type: "ielts_vocab", languageCode: "en", translationLanguageCode: "vi",
    languageSettings: "{}", createdBy: admin.id,
  }).returning();
  const wordsRows = [];
  for (let i = 0; i < 5; i += 1) {
    wordsRows.push({ setId: set.id, position: i + 1, term: `word${i + 1}`, meaning: `nghĩa${i + 1}` });
  }
  const inserted = await db.insert((await import("@/db/schema")).words).values(wordsRows).returning();
  const [conn] = await db.insert(googleSheetConnections).values({
    setId: set.id, createdBy: admin.id, spreadsheetId: `arch-${set.id}`, spreadsheetUrl: "u", spreadsheetName: "n",
    sheetId: 0, sheetTitle: "Từ vựng IELTS", rangeA1: "'Từ vựng IELTS'!A1:Q6",
    templateType: "ielts_vocab", templateVersion: 2, syncDirection: "google_to_lexora", deleteBehavior: "archive",
    enabled: true, status: "connected",
  }).returning();
  const tpl = getGoogleSheetTemplate(set as never);
  const sourceIds = inserted.map(() => generateSourceId());
  await db.insert(googleSheetRowMappings).values(inserted.map((word, i) => ({
    connectionId: conn.id, wordId: word.id, sourceId: sourceIds[i], sheetRowNumber: i + 2,
    sourceFingerprint: computeWordFingerprint("ielts_vocab", { term: word.term, meaning: word.meaning }),
    lastSyncedFingerprint: computeWordFingerprint("ielts_vocab", { term: word.term, meaning: word.meaning }),
  })));
  return { connectionId: conn.id, setId: set.id, wordIds: inserted.map((w) => w.id), sourceIds, set: set as never };
}

test("archived rows disappear from the admin read path (bug: delete in Sheet, admin still showed 5)", async () => {
  const fixture = await seed();
  try {
    const header = getGoogleSheetTemplate(fixture.set).fields.map((f) => f.header);
    const tpl = getGoogleSheetTemplate(fixture.set);
    const rowFor = (i: number) => tpl.fields.map((f) => (f.key === SOURCE_ID_HEADER ? fixture.sourceIds[i] : f.key === "term" ? `word${i + 1}` : f.key === "meaning" ? `nghĩa${i + 1}` : ""));

    // Simulate deleting 3 of 5 rows in the Sheet, then sync.
    const grid = gridFromValuesRange([header, rowFor(0), rowFor(1)]);
    const state = { id: fixture.connectionId, setId: fixture.setId, spreadsheetId: "x", sheetTitle: tpl.sheetTitle, deleteBehavior: "archive", status: "connected", enabled: true };
    const run = await db.transaction((tx) => runVocabularySync(state, grid, tx));
    assert.equal(run.stats.rowsDeleted, 3, "the 3 removed rows must be archived");

    const mappings = await db.select().from(googleSheetRowMappings).where(eq(googleSheetRowMappings.connectionId, fixture.connectionId));
    assert.equal(mappings.filter((m) => m.deletedAt).length, 3, "3 mappings archived");
    assert.equal(mappings.filter((m) => !m.deletedAt).length, 2, "2 mappings still active");

    // words are never destroyed (learning data stays intact)
    const allWords = await db.select().from(words).where(eq(words.setId, fixture.setId));
    assert.equal(allWords.length, 5, "archive must not delete rows");

    // the admin read path must now return 2
    const visible = await db.select()
      .from(words)
      .leftJoin(googleSheetRowMappings, and(eq(googleSheetRowMappings.wordId, words.id), visibleWordsJoin(fixture.connectionId)))
      .where(and(eq(words.setId, fixture.setId), visibleWordsFilter(fixture.connectionId)));
    assert.equal(visible.length, 2, `admin must see 2 words, saw ${visible.length}`);
  } finally {
    await db.delete(googleSheetRowMappings).where(eq(googleSheetRowMappings.connectionId, fixture.connectionId));
    await db.delete(words).where(eq(words.setId, fixture.setId));
    await db.delete((await import("@/db/schema")).googleSheetConnections).where(eq((await import("@/db/schema")).googleSheetConnections.id, fixture.connectionId));
    await db.delete((await import("@/db/schema")).vocabSets).where(eq((await import("@/db/schema")).vocabSets.id, fixture.setId));
  }
});

test("a row restored in the Sheet is un-archived and reappears in the admin", async () => {
  const fixture = await seed();
  try {
    const tpl = getGoogleSheetTemplate(fixture.set);
    const header = tpl.fields.map((f) => f.header);
    const rowFor = (i: number) => tpl.fields.map((f) => (f.key === SOURCE_ID_HEADER ? fixture.sourceIds[i] : f.key === "term" ? `word${i + 1}` : f.key === "meaning" ? `nghĩa${i + 1}` : ""));
    const state = { id: fixture.connectionId, setId: fixture.setId, spreadsheetId: "x", sheetTitle: tpl.sheetTitle, deleteBehavior: "archive", status: "connected", enabled: true };

    // 1. delete everything
    await db.transaction((tx) => runVocabularySync(state, gridFromValuesRange([header]), tx));
    const archived = await db.select().from(googleSheetRowMappings).where(eq(googleSheetRowMappings.connectionId, fixture.connectionId));
    assert.equal(archived.filter((m) => m.deletedAt).length, 5);

    // 2. restore two rows in the Sheet
    const run = await db.transaction((tx) => runVocabularySync(state, gridFromValuesRange([header, rowFor(0), rowFor(2)]), tx));
    assert.equal(run.stats.rowsCreated, 0, "restoring must not create a duplicate word");
    assert.ok(run.stats.unarchivedWordIds.length === 2, `expected 2 unarchived, got ${run.stats.unarchivedWordIds.length}`);

    const after = await db.select().from(googleSheetRowMappings).where(eq(googleSheetRowMappings.connectionId, fixture.connectionId));
    assert.equal(after.filter((m) => !m.deletedAt).length, 2, "2 mappings active again");

    // 3. admin sees exactly the restored 2
    const visible = await db.select()
      .from(words)
      .leftJoin(googleSheetRowMappings, and(eq(googleSheetRowMappings.wordId, words.id), visibleWordsJoin(fixture.connectionId)))
      .where(and(eq(words.setId, fixture.setId), visibleWordsFilter(fixture.connectionId)));
    assert.equal(visible.length, 2, `admin must see the 2 restored words, saw ${visible.length}`);
  } finally {
    await db.delete(googleSheetRowMappings).where(eq(googleSheetRowMappings.connectionId, fixture.connectionId));
    await db.delete(words).where(eq(words.setId, fixture.setId));
    await db.delete((await import("@/db/schema")).googleSheetConnections).where(eq((await import("@/db/schema")).googleSheetConnections.id, fixture.connectionId));
    await db.delete((await import("@/db/schema")).vocabSets).where(eq((await import("@/db/schema")).vocabSets.id, fixture.setId));
  }
});

test("archiving a Sheet row never touches learning data", async () => {
  const fixture = await seed();
  try {
    const tpl = getGoogleSheetTemplate(fixture.set);
    const header = tpl.fields.map((f) => f.header);
    const state = { id: fixture.connectionId, setId: fixture.setId, spreadsheetId: "x", sheetTitle: tpl.sheetTitle, deleteBehavior: "archive", status: "connected", enabled: true };
    const victim = fixture.wordIds[4];
    const wordId = fixture.wordIds[4];

    // learning data for the row that will be archived
    await db.insert((await import("@/db/schema")).wordProgress).values({ userId: 1, wordId, known: true, intervalDays: 14, reviewStreak: 5, correctCount: 9, wrongCount: 2, lastMode: "fill", nextReviewAt: new Date(Date.now() + 3 * 86400_000) });
    await db.insert((await import("@/db/schema")).mistakes).values({ userId: 1, wordId, setId: fixture.setId, timesWrong: 4, lastReason: "wrong_meaning" });
    const before = await db.select().from((await import("@/db/schema")).wordProgress).where(eq((await import("@/db/schema")).wordProgress.wordId, wordId));

    await db.transaction((tx) => runVocabularySync(state, gridFromValuesRange([header]), tx));

    const after = await db.select().from((await import("@/db/schema")).wordProgress).where(eq((await import("@/db/schema")).wordProgress.wordId, wordId));
    assert.deepEqual(after, before, "word_progress must survive archiving");
    const stillExists = await db.select().from(words).where(eq(words.id, wordId));
    assert.equal(stillExists.length, 1, "the word row must survive");
    const mistakes = await db.select().from((await import("@/db/schema")).mistakes).where(eq((await import("@/db/schema")).mistakes.wordId, wordId));
    assert.equal(mistakes.length, 1, "mistakes must survive");
  } finally {
    await db.delete((await import("@/db/schema")).mistakes).where(eq((await import("@/db/schema")).mistakes.setId, fixture.setId));
    await db.delete(googleSheetRowMappings).where(eq(googleSheetRowMappings.connectionId, fixture.connectionId));
    await db.delete(words).where(eq(words.setId, fixture.setId));
    await db.delete((await import("@/db/schema")).googleSheetConnections).where(eq((await import("@/db/schema")).googleSheetConnections.id, fixture.connectionId));
    await db.delete((await import("@/db/schema")).vocabSets).where(eq((await import("@/db/schema")).vocabSets.id, fixture.setId));
  }
});

test("the admin read paths consult mapping.deleted_at, not just SELECT * FROM words", () => {
  const detail = readFileSync("src/app/api/sets/[id]/route.ts", "utf8");
  assert.match(detail, /archiveFilters && gsConnection/, "set detail only filters when the connection archives");
  assert.match(detail, /googleSheetRowMappings.deletedAt/, "set detail must consult the mapping archive flag");
  assert.match(detail, /archived[.]has/, "archived words must be filtered out of the detail list");
  assert.ok(!/db.select().from(words).where(eq(words.setId, setId)).orderBy(asc(words.position), asc(words.id))/.test(detail), "the unfiltered query must be gone");
  const list = readFileSync("src/app/api/sets/route.ts", "utf8");
  assert.match(list, /archivedCountBySet/, "the set list count must exclude archived rows");
  assert.match(list, /isNotNull\(googleSheetRowMappings\.deletedAt\)/, "archived rows are counted by mapping.deleted_at");
  assert.ok(!/\.leftJoin\(googleSheetRowMappings/.test(list), "the set list must NOT join the mappings - that fans one set into N cards");
  const sync = readFileSync("src/lib/googleSheets/syncVocabulary.ts", "utf8");
  assert.match(sync, /deletedAt: null/, "a restored row must be un-archived");
  assert.match(sync, /unarchivedWordIds/, "un-archived rows must be reported");
});