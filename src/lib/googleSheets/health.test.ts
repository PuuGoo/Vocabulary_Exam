import assert from "node:assert/strict";
import test from "node:test";
import { inspectSheetHealth } from "./health";
import { getGoogleSheetTemplate, SOURCE_ID_HEADER } from "./template";
import { aiColumnsForTemplate, buildAiColumnFormulas } from "./aiFormula";

function fixture() {
  const template = getGoogleSheetTemplate({ type: "ielts_vocab", languageCode: "en" });
  const headers = template.fields.map(field => field.header);
  const row: string[] = template.fields.map(field => field.key === SOURCE_ID_HEADER ? "v_12345678" : field.key === "term" ? "hello" : field.key === "meaning" ? "xin chao" : "");
  const formula = [...row]; formula[0] = "=ROW()-1";
  return { values: [headers, row], formulas: [headers, formula], template, setType: "ielts_vocab", mappings: [{ sourceId: "v_12345678", wordId: 1, deletedAt: null }], channel: { status: "active", expirationAt: new Date(Date.now() + 60000), channelTokenHash: "hash" }, enabled: true, status: "connected", templateVersion: template.templateVersion };
}
test("healthy read-only inspection leaves its input untouched", () => {
  const input = fixture(); const before = JSON.stringify(input);
  assert.equal(inspectSheetHealth(input).healthy, true);
  assert.equal(JSON.stringify(input), before);
});

test("ambiguous aliases produce actionable health diagnostics instead of throwing", () => {
  const input = fixture();
  input.values[0].push("Từ");
  const report = inspectSheetHealth(input);
  assert.equal(report.healthy, false);
  assert.equal(report.issues[0].code, "DUPLICATE_HEADERS");
});
test("duplicate identities and words are actionable issues", () => {
  const input = fixture(); input.values.push([...input.values[1]]); input.formulas.push([...input.formulas[1]]);
  const report = inspectSheetHealth(input);
  assert.deepEqual(report.issues.find(issue => issue.code === "IDS_DUPLICATE")?.rows, [3]);
  assert.deepEqual(report.issues.find(issue => issue.code === "WORDS_DUPLICATE")?.rows, [3]);
});
test("missing mapping, expired watch and absent STT formula are reported", () => {
  const input = fixture(); input.mappings = []; input.channel.expirationAt = new Date(0); input.formulas[1][0] = "1";
  const codes = inspectSheetHealth(input).issues.map(issue => issue.code);
  for (const code of ["MAPPINGS_MISSING", "WATCH_INACTIVE", "STT_FORMULA"]) assert.ok(codes.includes(code));
});

test("invalid source IDs and missing headers are not reported as healthy", () => {
  const input = fixture();
  const sourceIndex = input.template.fields.findIndex(field => field.key === SOURCE_ID_HEADER);
  input.values[1][sourceIndex] = "user-edited-id";
  input.values[0][input.template.fields.findIndex(field => field.key === "meaning")] = "unknown column";
  const report = inspectSheetHealth(input);
  assert.equal(report.healthy, false);
  assert.ok(report.issues.some(issue => issue.code === "IDS_INVALID"));
  assert.ok(report.issues.some(issue => issue.code === "HEADERS_MISSING"));
});

test("health identifies outdated AI instructions but does not guess plain-text provenance", () => {
  const input = fixture();
  const plan = aiColumnsForTemplate(input.template.templateType).find(plan => plan.key === "meaning")!;
  const column = input.template.fields.findIndex(field => field.key === "meaning");
  input.formulas[1][column] = buildAiColumnFormulas(input.template, "AI", plan, 1, 2)[0];
  assert.equal(inspectSheetHealth(input).issues.some(issue => issue.code === "AI_PROMPT_DIFFERS"), false);
  input.formulas[1][column] = '=AI("old prompt",C2)';
  assert.equal(inspectSheetHealth(input).issues.some(issue => issue.code === "AI_PROMPT_DIFFERS"), true);
  input.formulas[1][column] = "user text or materialized AI";
  assert.equal(inspectSheetHealth(input).issues.some(issue => issue.code === "AI_PROMPT_DIFFERS"), false);
});
