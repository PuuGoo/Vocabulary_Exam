import assert from "node:assert/strict";
import test from "node:test";
import { planSystemRepair } from "./repair";
import { getGoogleSheetTemplate } from "./template";

function fixture() {
  const template = getGoogleSheetTemplate({ type: "ielts_vocab", languageCode: "en" });
  return { template, sheetTitle: template.sheetTitle, setType: "ielts_vocab", formulas: [template.fields.map(field => field.header), ["", "", "hello", "xin chao", "user IPA"]], words: [{ id: 1, term: "hello", v1: null, v2: null, v3: null }], mappings: [{ wordId: 1, sourceId: "v_12345678" }] };
}
test("repair reuses stable identity and only writes system columns", () => {
  const input = fixture(); const before = JSON.stringify(input);
  const plan = planSystemRepair(input);
  assert.equal(plan.idsAssigned, 1); assert.equal(plan.sttRepaired, 1);
  assert.deepEqual(plan.updates[0].values, [["v_12345678"]]);
  assert.equal(plan.updates[0].parseFormulas, false);
  assert.ok(plan.updates.every(update => /![AB]2$/.test(update.rangeA1)));
  assert.equal(JSON.stringify(input), before);
});
test("repair refuses ambiguous headers, duplicate IDs and reused identities", () => {
  const input = fixture(); input.formulas[0][0] = "user content";
  assert.throws(() => planSystemRepair(input), /thứ tự cột/);
  const duplicates = fixture(); duplicates.formulas.push(["", "v_12345678", "hello"]);
  assert.throws(() => planSystemRepair(duplicates), /dòng khác/);
  duplicates.formulas[1][1] = "v_12345678";
  assert.throws(() => planSystemRepair(duplicates), /ID sai hoặc trùng/);
});
