import assert from "node:assert/strict";
import test from "node:test";
import { getGoogleSheetTemplate } from "./template";
import { valuesForExport } from "./spreadsheet";
import { verifyReplacementExport } from "./replacementVerification";

const template = getGoogleSheetTemplate({ type: "ielts_vocab", languageCode: "en" });
const expected = [{ sourceId: "v_12345678", values: { term: "hello", meaning: "xin chào", example: "Test sheet" } }];
test("replacement verifies every exported business field and ID", () => {
  const values = valuesForExport(template, expected);
  assert.deepEqual(verifyReplacementExport(template, values, expected), { verifiedRows: 1 });
  const changed = values.map(row => [...row]);
  changed[1][template.fields.findIndex(field => field.key === "example")] = "wrong";
  assert.throws(() => verifyReplacementExport(template, changed, expected));
  assert.throws(() => verifyReplacementExport(template, [values[0]], expected));
  assert.throws(() => verifyReplacementExport(template, [...values, values[1]], expected));
});

test("row movement and STT do not affect replacement identity", () => {
  const multiple = [...expected, { sourceId: "v_87654321", values: { term: "world", meaning: "thế giới", example: "" } }];
  const values = valuesForExport(template, multiple);
  values[1][0] = 999;
  assert.equal(verifyReplacementExport(template, [values[0], values[2], values[1]], multiple).verifiedRows, 2);
});

test("STT and unmaterialized AI buffer rows are not vocabulary", () => {
  const values = valuesForExport(template, expected);
  const buffer = template.fields.map(field => field.displayOnly ? "2" : field.key === "meaning" ? '=AI("meaning",C3)' : "");
  assert.equal(verifyReplacementExport(template, [...values, buffer], expected).verifiedRows, 1);
});
