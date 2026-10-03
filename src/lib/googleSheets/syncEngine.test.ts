import assert from "node:assert/strict";
import test from "node:test";
import { parseSpreadsheetUrl } from "./spreadsheet";
import { getGoogleSheetTemplate, SOURCE_ID_HEADER, STT_FIELD_KEY, STT_HEADER } from "./template";
import { computeWordFingerprint, fingerprintFields } from "./fingerprint";
import { generateSourceId, isValidSourceId, fallbackIdentityForRow } from "./identity";
import { parseSheetGrid, gridFromValuesRange, mapHeadersToFieldKeys } from "./parser";
import { createSyncPlan, planRow } from "./diff";

test("spreadsheet URL parser extracts ids from common Google Sheets links", () => {
  assert.equal(parseSpreadsheetUrl("https://docs.google.com/spreadsheets/d/abc123XYZ_-9/edit#gid=0"), "abc123XYZ_-9");
  assert.equal(parseSpreadsheetUrl("https://docs.google.com/spreadsheets/d/abc123XYZ_-9"), "abc123XYZ_-9");
  assert.equal(parseSpreadsheetUrl("https://example.com/abc"), null);
  assert.equal(parseSpreadsheetUrl(""), null);
});

test("IELTS template has the documented columns including __lexora_id", () => {
  const template = getGoogleSheetTemplate({ type: "ielts_vocab", languageCode: "en" });
  // STT is the human-facing first column; __lexora_id is still the identity.
  assert.equal(template.fields[0].key, STT_FIELD_KEY);
  assert.equal(template.fields[0].header, STT_HEADER);
  assert.equal(template.fields[1].key, SOURCE_ID_HEADER);
  assert.equal(template.fields[1].header, SOURCE_ID_HEADER);
  const headers = template.fields.map((field) => field.header);
  for (const expected of ["Word", "Meaning", "IPA", "Part of Speech", "Example", "CEFR", "IELTS Band"]) assert.ok(headers.includes(expected), `missing ${expected}`);
});

test("irregular verb and Mandarin templates differ by set type/language", () => {
  const verbs = getGoogleSheetTemplate({ type: "irregular_verb", languageCode: "en" });
  assert.ok(verbs.fields.some((field) => field.key === "v1" && field.header === "V1"));
  assert.ok(verbs.fields.some((field) => field.key === "ipaV3" && field.header === "IPA V3"));
  const mandarin = getGoogleSheetTemplate({ type: "language_vocab", languageCode: "zh-CN" });
  assert.ok(mandarin.fields.some((field) => field.key === "term" && field.header === "Chữ Hán"));
  assert.ok(mandarin.fields.some((field) => field.key === "pronunciation" && field.header === "Pinyin"));
  assert.ok(mandarin.fields.some((field) => field.key === "level" && field.header === "HSK"));
});

test("fingerprint ignores whitespace differences but tracks content changes", () => {
  const a = fingerprintFields({ term: " abandon " }, ["term"]);
  const b = fingerprintFields({ term: "abandon" }, ["term"]);
  assert.equal(a, b);
  const c = fingerprintFields({ term: "acquire" }, ["term"]);
  assert.notEqual(a, c);
});

test("fingerprint tracks the reported scenario: example old -> test, and ignores STT/row number", () => {
  const base = { term: "mitigate", meaning: "giảm nhẹ", ipa: "/ˈmɪtɪɡeɪt/", example: "Although simple digital greetings..." };
  const oldFingerprint = computeWordFingerprint("ielts_vocab", base);
  const newFingerprint = computeWordFingerprint("ielts_vocab", { ...base, example: "test" });
  assert.notEqual(oldFingerprint, newFingerprint, "the example change must produce a different fingerprint");
  const withSttA = fingerprintFields({ ...base, stt: "1", rowNumber: "2" }, ["term", "meaning", "ipa", "example"]);
  const withSttB = fingerprintFields({ ...base, stt: "999", rowNumber: "42" }, ["term", "meaning", "ipa", "example"]);
  assert.equal(withSttA, withSttB, "STT and row number must never affect the fingerprint");
});

test("source IDs are stable, prefixed and unique", () => {
  const id = generateSourceId();
  assert.ok(isValidSourceId(id));
  assert.ok(id.startsWith("v_"));
  const collisionSet = new Set([id]);
  const next = generateSourceId(collisionSet);
  assert.notEqual(id, next);
  assert.ok(isValidSourceId(next));
  assert.equal(isValidSourceId("not-an-id"), false);
});

test("irregular verb fallback identity matches CSV importer semantics", () => {
  assert.equal(fallbackIdentityForRow("irregular_verb", { v1: "Go", v2: "Went", v3: "Gone" }), "go|went|gone");
  assert.equal(fallbackIdentityForRow("ielts_vocab", { term: " MEAL " }), "meal");
});

test("parser maps reordered headers to canonical field keys", () => {
  const template = getGoogleSheetTemplate({ type: "ielts_vocab", languageCode: "en" });
  const grid = {
    headers: [SOURCE_ID_HEADER, "Meaning", "Word"],
    rows: [["v_abc123", "từ bỏ", "abandon"]],
  };
  const parsed = parseSheetGrid(grid, template);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].sourceId, "v_abc123");
  assert.equal(parsed[0].values.term, "abandon");
  assert.equal(parsed[0].values.meaning, "từ bỏ");
});

test("gridFromValuesRange drops the header row and stringifies cells", () => {
  const grid = gridFromValuesRange([["Word", "Meaning"], ["abandon", "từ bỏ"]]);
  assert.deepEqual(grid.headers, ["Word", "Meaning"]);
  assert.deepEqual(grid.rows, [["abandon", "từ bỏ"]]);
  assert.deepEqual(gridFromValuesRange(undefined).rows, []);
});

test("blank rows produce no invalid counts", () => {
  const template = getGoogleSheetTemplate({ type: "ielts_vocab", languageCode: "en" });
  const grid = { headers: template.fields.map((field) => field.header), rows: [["", ""]] };
  const parsed = parseSheetGrid(grid, template);
  assert.equal(parsed.length, 1);
  assert.equal(Object.values(parsed[0].values).some((value) => value !== ""), false);
});

test("planRow escalates to CONFLICT when DB diverged from last sync", () => {
  const unchanged = planRow({ action: "UPDATED", rowNumber: 2, sourceId: "v_1", lastSyncedFingerprint: "f1", dbFingerprint: "f1", fingerprint: "f2" });
  assert.equal(unchanged.action, "UPDATED");
  const conflict = planRow({ action: "UPDATED", rowNumber: 2, sourceId: "v_1", lastSyncedFingerprint: "f1", dbFingerprint: "f0", fingerprint: "f2" });
  assert.equal(conflict.action, "CONFLICT");
});

test("createSyncPlan counts every action category", () => {
  const plan = createSyncPlan([
    { action: "CREATED", rowNumber: 2, sourceId: "v_a" },
    { action: "UPDATED", rowNumber: 3, sourceId: "v_b" },
    { action: "UNCHANGED", rowNumber: 4, sourceId: "v_c" },
    { action: "DELETED", rowNumber: 5, sourceId: "v_d" },
    { action: "DUPLICATE", rowNumber: 6, sourceId: "v_e" },
    { action: "INVALID", rowNumber: 7, sourceId: "v_f" },
    { action: "CONFLICT", rowNumber: 8, sourceId: "v_g" },
  ]);
  assert.equal(plan.counts.CREATED, 1);
  assert.equal(plan.counts.CONFLICT, 1);
  assert.equal(plan.invalidRows.length, 1);
});
