import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { googleSheetConnections, googleSheetRowMappings, mistakes, userWordSkillProgress, vocabSets, wordProgress, words } from "@/db/schema";
import { getGoogleSheetTemplate, SOURCE_ID_HEADER, STT_FIELD_KEY } from "@/lib/googleSheets/template";
import { computeWordFingerprint } from "@/lib/googleSheets/fingerprint";
import { generateSourceId } from "@/lib/googleSheets/identity";
import { gridFromValuesRange } from "@/lib/googleSheets/parser";
import { runVocabularySync } from "@/lib/googleSheets/syncVocabulary";

const enabled = Boolean(process.env.DATABASE_URL && process.env.GOOGLE_SHEET_TOKEN_ENCRYPTION_KEY);

test("acceptance #17 on real Postgres: sync edits content but never resets learning data", { skip: !enabled, timeout: 90000 }, async (t) => {
  const sql = postgres(process.env.DATABASE_URL as string, { max: 1, ssl: "require", connect_timeout: 30 });
  let setId = 0;
  let wordId = 0;
  let connectionId = 0;
  try {
    const [admin] = await sql`select id from users where role='admin' order by id limit 1`;
    const [set] = await sql`insert into vocab_sets (name, type, language_code, translation_language_code, language_settings, created_by)
      values ('__gs_ac__','ielts_vocab','en','vi','{}',${admin.id}) returning id`;
    setId = set.id;
    const [word] = await sql`insert into words (set_id, position, meaning, term)
      values (${setId},1,'giảm nhẹ','mitigate') returning id`;
    wordId = word.id;
    await sql`insert into word_progress (user_id, word_id, known, interval_days, review_streak, correct_count, wrong_count, last_mode, next_review_at)
      values (${admin.id},${wordId},true,14,5,9,2,'fill', now() + interval '3 days')`;
    await sql`insert into mistakes (user_id, word_id, set_id, times_wrong, last_reason)
      values (${admin.id},${wordId},${setId},4,'wrong_meaning')`;
    await sql`insert into user_word_skill_progress (user_id, word_id, skill, mastery_score, practice_count, success_count, failure_count, last_result)
      values (${admin.id},${wordId},'meaning_recognition',77,8,6,2,'correct')`;

    const [conn] = await sql`insert into google_sheet_connections
      (set_id, created_by, spreadsheet_id, spreadsheet_url, spreadsheet_name, sheet_id, sheet_title, range_a1,
       template_type, template_version, sync_direction, delete_behavior, enabled, status)
      values (${setId},${admin.id},'ac-sheet','u','n',0,'T','r','ielts_vocab',1,'google_to_lexora','archive',true,'connected')
      returning id`;
    connectionId = conn.id;

    const setRow = (await db.select().from(vocabSets).where(eq(vocabSets.id, setId)).limit(1))[0];
    const tpl = getGoogleSheetTemplate(setRow);
    const sourceId = generateSourceId();
    const wordRow = (await db.select().from(words).where(eq(words.id, wordId)).limit(1))[0];
    await db.insert(googleSheetRowMappings).values({
      connectionId,
      wordId,
      sourceId,
      sheetRowNumber: 2,
      lastSyncedFingerprint: computeWordFingerprint("ielts_vocab", { term: wordRow.term || "", meaning: wordRow.meaning }),
    });

    const before = {
      progress: (await sql`select * from word_progress where word_id=${wordId}`)[0],
      mistake: (await sql`select * from mistakes where word_id=${wordId}`)[0],
      skill: (await sql`select * from user_word_skill_progress where word_id=${wordId}`)[0],
    };

    const sttIdx = tpl.fields.findIndex((f) => f.key === STT_FIELD_KEY);
    const sourceIdx = tpl.fields.findIndex((f) => f.key === SOURCE_ID_HEADER);
    const termIdx = tpl.fields.findIndex((f) => f.key === "term");
    const meaningIdx = tpl.fields.findIndex((f) => f.key === "meaning");
    // STT is a display-only formula column: we fill plausible numbers to prove
    // the sync ignores them entirely.
    const row = (meaning: string, stt: string = "1") =>
      tpl.fields.map((f, ci) => (ci === sttIdx ? stt : ci === sourceIdx ? sourceId : ci === termIdx ? "mitigate" : ci === meaningIdx ? meaning : ""));
    const header = tpl.fields.map((f) => f.header);
    const state = { id: connectionId, setId, spreadsheetId: "ac-sheet", sheetTitle: tpl.sheetTitle, deleteBehavior: "archive", status: "connected", enabled: true };

    const run1 = await db.transaction((tx) => runVocabularySync(state, gridFromValuesRange([header, row("giảm nhẹ / làm dịu")]), tx));
    assert.equal(run1.stats.rowsUpdated, 1, "edited row must be an UPDATE");
    assert.equal(run1.stats.rowsCreated, 0, "no new word may be created");

    const afterWord = (await sql`select id, meaning from words where id=${wordId}`)[0];
    assert.equal(afterWord.id, wordId, "wordId must not change");
    assert.equal(afterWord.meaning, "giảm nhẹ / làm dịu", "meaning must be updated");

    const after = {
      progress: (await sql`select * from word_progress where word_id=${wordId}`)[0],
      mistake: (await sql`select * from mistakes where word_id=${wordId}`)[0],
      skill: (await sql`select * from user_word_skill_progress where word_id=${wordId}`)[0],
    };
    assert.deepEqual(after.progress, before.progress, "word_progress must be untouched");
    assert.deepEqual(after.mistake, before.mistake, "mistakes must be untouched");
    assert.deepEqual(after.skill, before.skill, "user_word_skill_progress must be untouched");

    const run2 = await db.transaction((tx) => runVocabularySync(state, gridFromValuesRange([header, row("giảm nhẹ / làm dịu")]), tx));
    assert.equal(run2.stats.rowsUpdated, 0, "second sync must be a no-op");
    assert.equal(run2.stats.rowsUnchanged, 1, "second sync must report UNCHANGED");

    // STT changes (and row moves) must never look like a vocabulary change.
    const sttShift = await db.transaction((tx) => runVocabularySync(state, gridFromValuesRange([header, row("giảm nhẹ / làm dịu", "987")]), tx));
    assert.equal(sttShift.stats.rowsUpdated, 0, "changing only STT must not update the word");
    assert.equal(sttShift.stats.rowsUnchanged, 1, "changing only STT must report UNCHANGED");
    assert.equal(sttShift.stats.rowsCreated, 0, "changing only STT must not create a word");
    const afterStt = (await sql`select id, meaning from words where id=${wordId}`)[0];
    assert.deepEqual(afterStt, { id: wordId, meaning: "giảm nhẹ / làm dịu" }, "STT must not alter the word row");
    const sttColumns = (await sql`select column_name from information_schema.columns where table_name='words' and column_name ilike '%stt%'`);
    assert.equal(sttColumns.length, 0, "the words table must never persist STT");
    const wordCount = (await sql`select count(*)::int as n from words where set_id=${setId}`)[0];
    assert.equal(wordCount.n, 1, "no duplicate word may be created");

    const reorder = await db.transaction((tx) => runVocabularySync(state, gridFromValuesRange([header, row("giảm nhẹ / làm dịu")]), tx));
    assert.equal(reorder.stats.rowsCreated, 0, "reorder must not create a word");
    const same = (await sql`select id from words where id=${wordId}`)[0];
    assert.equal(same.id, wordId, "reorder must keep the same wordId");

    const remove = await db.transaction((tx) => runVocabularySync(state, gridFromValuesRange([header, []]), tx));
    assert.equal(remove.stats.rowsDeleted, 1, "removed row must be archived");
    const survivors = await sql`select id from words where set_id=${setId}`;
    assert.equal(survivors.length, 1, "archive must NOT delete the word row");
    const archived = (await sql`select deleted_at is not null as a from google_sheet_row_mappings where source_id=${sourceId}`)[0];
    assert.equal(archived.a, true, "the mapping must be marked archived");

  } finally {
    try {
      await sql.begin(async (tx) => {
        await tx`delete from user_word_skill_progress where word_id=${wordId}`;
        await tx`delete from mistakes where word_id=${wordId}`;
        await tx`delete from word_progress where word_id=${wordId}`;
        await tx`delete from google_sheet_row_mappings where connection_id=${connectionId}`;
        await tx`delete from google_sheet_connections where id=${connectionId}`;
        await tx`delete from words where set_id=${setId}`;
        await tx`delete from vocab_sets where id=${setId}`;
      });
    } finally {
      await sql.end();
    }
  }
});
