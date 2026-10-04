import assert from "node:assert/strict";
import test from "node:test";
import { planMappingRepair } from "./mappingRepair";
import { getGoogleSheetTemplate } from "./template";

const template = getGoogleSheetTemplate({ type: "ielts_vocab", languageCode: "en" });
const word = { id: 123, term: "hello", v1: null, v2: null, v3: null };
const header = template.fields.map(field => field.header);
const row = template.fields.map(field => field.key === "__lexora_id" ? "v_12345678" : field.key === "term" ? "hello" : "");
test("mapping recovery preserves the actual Sheet ID and existing word ID", () => {
  const result = planMappingRepair({ values: [header, row], template, setType: "ielts_vocab", words: [word], mappings: [] });
  assert.equal(result.length, 1);
  assert.equal(result[0].sourceId, "v_12345678");
  assert.equal(result[0].wordId, 123);
  assert.equal(result[0].sheetRowNumber, 2);
});
test("mapping recovery refuses duplicate rows and remapping an existing word", () => {
  const input = { values: [header, row, row], template, setType: "ielts_vocab", words: [word], mappings: [] };
  assert.throws(() => planMappingRepair(input));
  assert.throws(() => planMappingRepair({ ...input, values: [header, row], mappings: [{ wordId: 123, sourceId: "v_87654321" }] }));
});
test("already mapped rows are unchanged and absent rows do not receive synthetic IDs", () => {
  const input = { values: [header, row], template, setType: "ielts_vocab", words: [word], mappings: [{ wordId: 123, sourceId: "v_12345678" }] };
  assert.deepEqual(planMappingRepair(input), []);
  assert.deepEqual(planMappingRepair({ ...input, values: [header], mappings: [] }), []);
});
