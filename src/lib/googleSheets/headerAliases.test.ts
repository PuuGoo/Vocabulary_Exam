import assert from "node:assert/strict";
import test from "node:test";
import { mapHeadersToFieldKeys, parseSheetGrid } from "./parser";
import { getGoogleSheetTemplate } from "./template";

test("Sheets reuses Vietnamese CSV/XLSX aliases without importing STT", () => {
  const template = getGoogleSheetTemplate({ type: "ielts_vocab", languageCode: "en" });
  const rows = parseSheetGrid({ headers: ["STT", "__lexora_id", "Từ", "Nghĩa", "Loại từ", "Ví dụ"], rows: [["8", "v_12345678", "hello", "xin chào", "noun", "Hello there"]] }, template);
  assert.equal(rows[0].values.term, "hello");
  assert.equal(rows[0].values.meaning, "xin chào");
  assert.equal(rows[0].values.wtype, "noun");
  assert.equal(rows[0].values.example, "Hello there");
  assert.equal(Object.hasOwn(rows[0].values, "__stt"), false);
});

test("Mandarin and irregular Sheets share importer header aliases", () => {
  const mandarin = getGoogleSheetTemplate({ type: "language_vocab", languageCode: "zh-CN" });
  const mapped = mapHeadersToFieldKeys(["生词", "意思", "拼音", "词性"], mandarin);
  assert.deepEqual([...mapped.values()].sort(), ["term", "meaning", "pronunciation", "wtype"].sort());
  const irregular = getGoogleSheetTemplate({ type: "irregular_verb", languageCode: "en" });
  assert.equal(mapHeadersToFieldKeys(["ipa_v1"], irregular).get(0), "ipaV1");
});

test("two aliases for one field are rejected instead of silently discarding content", () => {
  const template = getGoogleSheetTemplate({ type: "ielts_vocab", languageCode: "en" });
  assert.throws(() => mapHeadersToFieldKeys(["Word", "Từ"], template), /Nhiều cột/);
});
