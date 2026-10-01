import assert from "node:assert/strict";
import test from "node:test";
import { canonicalGeneralRow, canonicalChineseRow, normalizeImportRow } from "@/lib/vocabImport/headerAliases";
import { parseVocabularyRows } from "@/lib/vocabImport/parse";

test("friendly CSV/XLSX headers round-trip to canonical keys", () => {
  const row = normalizeImportRow({ Tu: "abandon", Nghia: "từ bỏ", IPA: "/əˈbændən/" });
  const canonical = canonicalGeneralRow(row);
  assert.equal(canonical.term, "abandon");
  assert.equal(canonical.meaning, "từ bỏ");
  assert.equal(canonical.ipa, "/əˈbændən/");
});

test("Chinese headers map to the Mandarin field semantics", () => {
  const row = normalizeImportRow({ "Chữ Hán": "学生", "Phồn thể": "學生", Pinyin: "xuéshēng", Nghĩa: "học sinh", HSK: "HSK 1", "Lượng từ": "gè" });
  const canonical = canonicalChineseRow(row);
  assert.equal(canonical.term, "学生");
  assert.equal(canonical.alternateTerm, "學生");
  assert.equal(canonical.pronunciation, "xuéshēng");
  assert.equal(canonical.level, "HSK 1");
  assert.equal(canonical.classifier, "gè");
});

test("parseVocabularyRows normalizes text and dedupes against existing keys", () => {
  const result = parseVocabularyRows(
    [{ term: "  MEAL ", meaning: "bữa ăn" }, { term: "meal", meaning: "bữa ăn lặp" }, { term: "trip", meaning: "chuyến đi" }],
    { id: 1, type: "ielts_vocab", languageCode: "en" },
    ["meal"],
  );
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].term, "trip");
  assert.equal(result.duplicateCount, 2);
  assert.equal(result.invalidCount, 0);
  const identityResolution = parseVocabularyRows(
    [{ term: " MEAL ", meaning: "bữa ăn" }],
    { id: 1, type: "ielts_vocab", languageCode: "en" },
    ["meal"],
    { dedupeAgainstExisting: false },
  );
  assert.equal(identityResolution.rows.length, 1);
  assert.equal(identityResolution.duplicateCount, 0);
});

test("irregular verb rows require V1/V2/V3", () => {
  const result = parseVocabularyRows(
    [{ meaning: "đi", v1: "go", v2: "went", v3: "gone" }, { meaning: "đi thiếu", v1: "go", v2: "" }],
    { id: 2, type: "irregular_verb", languageCode: "en" },
    [],
  );
  assert.equal(result.rows.length, 1);
  assert.equal(result.invalidCount, 1);
});

test("Chinese rows get Pinyin canonicalized and a tone warning", () => {
  const result = parseVocabularyRows(
    [{ "Chữ Hán": "学生", Pinyin: "xuesheng", Nghĩa: "học sinh" }],
    { id: 3, type: "language_vocab", languageCode: "zh-CN" },
    [],
  );
  assert.equal(result.rows.length, 1);
  assert.equal(result.pinyinWarningRows.length, 1);
  assert.ok(result.rows[0].pronunciation !== null);
});

test("blank rows are ignored without becoming invalid", () => {
  const result = parseVocabularyRows(
    [{}, { term: "", meaning: "" }, { term: "ok", meaning: "được" }],
    { id: 4, type: "ielts_vocab", languageCode: "en" },
    [],
  );
  assert.equal(result.rows.length, 1);
  assert.equal(result.invalidCount, 0);
});


