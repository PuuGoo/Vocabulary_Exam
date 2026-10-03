import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { googleSheetConnections, googleSheetRowMappings, vocabSets, words } from "@/db/schema";
import { getGoogleSheetTemplate, SOURCE_ID_HEADER, STT_FIELD_KEY } from "@/lib/googleSheets/template";
import { fingerprintDbWord, fingerprintSheetValues } from "@/lib/googleSheets/fingerprint";
import { generateSourceId } from "@/lib/googleSheets/identity";
import { gridFromValuesRange } from "@/lib/googleSheets/parser";
import { runVocabularySync } from "@/lib/googleSheets/syncVocabulary";

const enabled = Boolean(process.env.DATABASE_URL && process.env.GOOGLE_SHEET_TOKEN_ENCRYPTION_KEY);

type Fixture = { setId: number; connectionId: number; wordId: number; sourceId: string };

async function seed(extra: Record<string, unknown> = {}): Promise<{ sql: ReturnType<typeof postgres>; fixture: Fixture }> {
  const sql = postgres(process.env.DATABASE_URL as string, { max: 1, ssl: "require", connect_timeout: 30 });
  const [admin] = await sql`select id from users where username = 'admin' limit 1`;
  if (!admin) throw new Error("no admin user");
  const [set] = await db.insert(vocabSets).values({
    name: `__fp_${Date.now()}`, type: "ielts_vocab", languageCode: "en", translationLanguageCode: "vi",
    languageSettings: "{}", createdBy: admin.id,
  }).returning();
  const [word] = await db.insert(words).values({
    setId: set.id, position: 1, term: "hello", meaning: "xin chao",
    example: "Although simple digital greetings...", ipa: "/həˈləʊ/", ...extra,
  }).returning();
  const template = getGoogleSheetTemplate(set);
  const sourceId = generateSourceId();
  const [conn] = await db.insert(googleSheetConnections).values({
    setId: set.id, createdBy: admin.id, spreadsheetId: `fp-${set.id}`, spreadsheetUrl: "u", spreadsheetName: "n",
    sheetId: 0, sheetTitle: template.sheetTitle, rangeA1: `'${template.sheetTitle}'!A1:Q2`,
    templateType: "ielts_vocab", templateVersion: 2, syncDirection: "google_to_lexora", deleteBehavior: "archive",
    enabled: true, status: "connected",
  }).returning();
  return { sql, fixture: { setId: set.id, connectionId: conn.id, wordId: word.id, sourceId } };
}

function grid(template: ReturnType<typeof getGoogleSheetTemplate>, fixture: Fixture, example: string, word = "hello") {
  const sttIdx = template.fields.findIndex((f) => f.key === STT_FIELD_KEY);
  const sourceIdx = template.fields.findIndex((f) => f.key === SOURCE_ID_HEADER);
  const termIdx = template.fields.findIndex((f) => f.key === "term");
  const meaningIdx = template.fields.findIndex((f) => f.key === "meaning");
  const ipaIdx = template.fields.findIndex((f) => f.key === "ipa");
  const exampleIdx = template.fields.findIndex((f) => f.key === "example");
  const header = template.fields.map((f) => f.header);
  const row = template.fields.map((f, i) => {
    if (i === sttIdx) return "1";
    if (i === sourceIdx) return fixture.sourceId;
    if (i === termIdx) return word;
    if (i === meaningIdx) return "xin chao";
    if (i === ipaIdx) return "/həˈləʊ/";
    if (i === exampleIdx) return example;
    return "";
  });
  return gridFromValuesRange([header, row]);
}

async function cleanup(sql: ReturnType<typeof postgres>, fixture: Fixture) {
  await sql.begin(async (tx) => {
    await tx`delete from google_sheet_row_mappings where connection_id=${fixture.connectionId}`;
    await tx`delete from google_sheet_connections where id=${fixture.connectionId}`;
    await tx`delete from words where set_id=${fixture.setId}`;
    await tx`delete from vocab_sets where id=${fixture.setId}`;
  });
}

/** Seed the mapping exactly as create/recovery do, via the canonical template fingerprint. */
async function seedMapping(template: ReturnType<typeof getGoogleSheetTemplate>, fixture: Fixture, example: string) {
  const word = (await db.select().from(words).where(eq(words.id, fixture.wordId)).limit(1))[0];
  const fingerprint = fingerprintDbWord(template, word as unknown as Record<string, unknown>);
  await db.insert(googleSheetRowMappings).values({
    connectionId: fixture.connectionId, wordId: fixture.wordId, sourceId: fixture.sourceId, sheetRowNumber: 2,
    sourceFingerprint: fingerprint, lastSyncedFingerprint: fingerprint,
  });
  return fingerprint;
}

function stateFor(fixture: Fixture, template: ReturnType<typeof getGoogleSheetTemplate>) {
  return { id: fixture.connectionId, setId: fixture.setId, spreadsheetId: "x", sheetTitle: template.sheetTitle, deleteBehavior: "archive", status: "connected", enabled: true };
}

// Spec item 16: a DB-only column outside the Sheet must not create a false conflict.
test("a DB-only column outside the IELTS Sheet never causes a false conflict", { skip: !enabled, timeout: 90000 }, async () => {
  const { sql, fixture } = await seed({ alternateTerm: "hi", pronunciation: "pinyin-only", classifier: "danh tu" });
  try {
    const template = getGoogleSheetTemplate({ type: "ielts_vocab", languageCode: "en" });
    const initial = "Although simple digital greetings...";
    await seedMapping(template, fixture, initial);

    // Sheet changes Example; the DB-only columns are untouched and not in the Sheet.
    const { stats } = await db.transaction((tx) => runVocabularySync(stateFor(fixture, template), grid(template, fixture, "Test sheet"), tx));
    const updated = (await db.select().from(words).where(eq(words.id, fixture.wordId)).limit(1))[0];
    assert.equal(updated.example, "Test sheet", "the Sheet edit must win");
    assert.equal(updated.id, fixture.wordId, "the same wordId is kept");
    assert.equal(stats.conflicts.length, 0, "a DB-only column must NOT produce a conflict");
    assert.equal(stats.rowsUpdated, 1);
    assert.equal(stats.rowsCreated, 0);
    assert.ok(stats.changedWordIds.includes(fixture.wordId));
  } finally {
    await cleanup(sql, fixture);
    await sql.end();
  }
});

// Spec items 5/7/18: the normal Sheet edit is an UPDATE, not a CONFLICT.
test("a normal Sheet edit is an UPDATE and lastSyncedFingerprint advances", { skip: !enabled, timeout: 90000 }, async () => {
  const { sql, fixture } = await seed();
  try {
    const template = getGoogleSheetTemplate({ type: "ielts_vocab", languageCode: "en" });
    const initial = "Although simple digital greetings...";
    await seedMapping(template, fixture, initial);

    const { stats } = await db.transaction((tx) => runVocabularySync(stateFor(fixture, template), grid(template, fixture, "Test sheet"), tx));
    assert.equal(stats.conflicts.length, 0, "DB == lastSynced means the Sheet is the changed side");
    assert.equal(stats.rowsUpdated, 1);
    assert.equal(stats.rowsCreated, 0);
    assert.ok(stats.changedWordIds.includes(fixture.wordId));

    const [mapping] = await db.select().from(googleSheetRowMappings).where(eq(googleSheetRowMappings.connectionId, fixture.connectionId));
    const expected = fingerprintSheetValues(template, { term: "hello", meaning: "xin chao", ipa: "/həˈləʊ/", example: "Test sheet" });
    assert.equal(mapping.lastSyncedFingerprint, expected, "lastSyncedFingerprint becomes the new Sheet fingerprint");

    // A second identical sync is a no-op.
    const again = await db.transaction((tx) => runVocabularySync(stateFor(fixture, template), grid(template, fixture, "Test sheet"), tx));
    assert.equal(again.stats.rowsUnchanged, 1, "B / B / B is stable");
    assert.equal(again.stats.conflicts.length, 0);
  } finally {
    await cleanup(sql, fixture);
    await sql.end();
  }
});

// Spec item 17: only a genuine two-sided divergence is a conflict, with structured metadata.
test("a true conflict is reported with structured metadata", { skip: !enabled, timeout: 90000 }, async () => {
  const { sql, fixture } = await seed();
  try {
    const template = getGoogleSheetTemplate({ type: "ielts_vocab", languageCode: "en" });
    await seedMapping(template, fixture, "A");

    // Lexora changes the DB, and the Sheet changes too: lastSynced=A, DB=B, Sheet=C.
    await db.update(words).set({ example: "B" }).where(eq(words.id, fixture.wordId));

    const { stats } = await db.transaction((tx) => runVocabularySync(stateFor(fixture, template), grid(template, fixture, "C"), tx));
    assert.equal(stats.conflicts.length, 1, "DB AND Sheet both moved since last sync");
    const conflict = stats.conflicts[0];
    assert.equal(conflict.rowNumber, 2);
    assert.equal(conflict.sourceId, fixture.sourceId, "sourceId is structured, not parsed from a message");
    assert.equal(conflict.word, "hello");
    assert.deepEqual(conflict.fieldsChanged, ["Example"], "fieldsChanged names the header");
    assert.equal(stats.rowsUpdated, 0, "a conflict must not silently overwrite");

    const after = (await db.select().from(words).where(eq(words.id, fixture.wordId)).limit(1))[0];
    assert.equal(after.example, "B", "the DB value is preserved until the admin resolves it");
  } finally {
    await cleanup(sql, fixture);
    await sql.end();
  }
});

// Spec item 19: Lexora edited, Lexora wrote the Sheet, and the mapping followed along.
test("a Lexora-originated change does not become a conflict on the next sync", { skip: !enabled, timeout: 90000 }, async () => {
  const { sql, fixture } = await seed();
  try {
    const template = getGoogleSheetTemplate({ type: "ielts_vocab", languageCode: "en" });
    await seedMapping(template, fixture, "A");

    // Lexora edits the word and writes the same value back to the Sheet.
    await db.update(words).set({ example: "B" }).where(eq(words.id, fixture.wordId));
    const word = (await db.select().from(words).where(eq(words.id, fixture.wordId)).limit(1))[0];
    const synced = fingerprintDbWord(template, word as unknown as Record<string, unknown>);
    await db.update(googleSheetRowMappings)
      .set({ lastSyncedFingerprint: synced, sourceFingerprint: synced, updatedAt: new Date() })
      .where(eq(googleSheetRowMappings.connectionId, fixture.connectionId));

    // The webhook caused by that write sees Sheet=B, DB=B, lastSynced=B.
    const { stats } = await db.transaction((tx) => runVocabularySync(stateFor(fixture, template), grid(template, fixture, "B"), tx));
    assert.equal(stats.conflicts.length, 0, "a Lexora-originated write must not conflict with itself");
    assert.equal(stats.rowsUpdated, 0, "and must not be applied twice");
    assert.equal(stats.rowsUnchanged, 1);
  } finally {
    await cleanup(sql, fixture);
    await sql.end();
  }
});