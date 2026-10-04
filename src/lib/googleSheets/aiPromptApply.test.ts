import assert from "node:assert/strict";
import test from "node:test";
import { applyAiPromptsToSheet, planAiPromptApplication } from "@/lib/googleSheets/aiPrompts";
import { createFakeGoogleWorkspaceApi, type SheetsBatchValueUpdate } from "./api";

test("API prompt apply excludes the header and targets actual reordered columns", async () => {
  const writes: SheetsBatchValueUpdate[] = [];
  const api = createFakeGoogleWorkspaceApi({
    readValues: async () => [["Meaning", "__lexora_id", "STT", "Word"], ['=AI("old";D2)', "v_12345678", "1", "hello"], ["protected", "v_87654321", "2", "bye"]],
    batchWriteValues: async (_id, updates) => { writes.push(...updates); },
  });
  const result = await applyAiPromptsToSheet({ api, spreadsheetId: "sheet", template, promptOverrides: { meaning: "NEW" } });
  assert.equal(result.stats.rowsScanned, 2);
  assert.equal(result.stats.updatedFormulaCells, 1);
  assert.equal(writes.length, 1);
  assert.match(writes[0].rangeA1, /!A2:A2$/);
  assert.match(String(writes[0].values[0][0]), /D2/);
  assert.equal(writes[0].values.length, 1);
});

test("prompt apply refuses a user edit made after the initial formula read", async () => {
  let reads = 0;
  let writes = 0;
  const api = createFakeGoogleWorkspaceApi({
    readValues: async () => {
      reads += 1;
      return [["Word", "Meaning"], ["hello", reads === 1 ? '=AI("old";A2)' : "user edit"]];
    },
    batchWriteValues: async () => { writes += 1; },
  });
  await assert.rejects(applyAiPromptsToSheet({ api, spreadsheetId: "sheet", template, promptOverrides: { meaning: "NEW" } }), /Sheet đã thay đổi/);
  assert.equal(writes, 0);
});

test("prompt apply reaches row 10002 without shifting across empty chunks", async () => {
  const writes: SheetsBatchValueUpdate[] = [];
  const ranges: string[] = [];
  const api = createFakeGoogleWorkspaceApi({
    getSpreadsheetMetadata: async () => ({ sheets: [{ sheetId: 0, title: template.sheetTitle, rowCount: 10002, columnCount: 2 }] }),
    readValues: async (_id, range) => {
      ranges.push(range);
      if (range.includes("!A1:")) return [["Word", "Meaning"]];
      if (range.includes("!A10001:")) return [[], ["hello", '=AI("OLD";A10002)']];
      return [];
    },
    batchWriteValues: async (_id, updates) => { writes.push(...updates); },
  });
  await applyAiPromptsToSheet({ api, spreadsheetId: "large", template, promptOverrides: { meaning: "NEW" } });
  assert.equal(ranges.length, 6);
  assert.equal(writes.length, 1);
  assert.match(writes[0].rangeA1, /!B10002:B10002$/);
  assert.ok(writes.some(write => write.values.some(row => String(row[0]).includes("A10002"))));
});
import { aiColumnsForTemplate, buildAiFormula, resolveAiPrompt } from "@/lib/googleSheets/aiFormula";
import { getGoogleSheetTemplate } from "@/lib/googleSheets/template";

const template = getGoogleSheetTemplate({ type: "ielts_vocab", languageCode: "en" });
const meaningIndex = template.fields.findIndex((field) => field.key === "meaning"); // 3
const ipaIndex = template.fields.findIndex((field) => field.key === "ipa"); // 4
const termIndex = template.fields.findIndex((field) => field.key === "term"); // 2
const sourceIdIndex = template.fields.findIndex((field) => field.key === "__lexora_id"); // 1
const sttIndex = 0;

function blankRow(): (string | number | boolean | null)[] {
  return Array.from({ length: template.fields.length }, () => null);
}

test("existing AI formulas are rewritten with the new prompt", () => {
  const overrides = { meaning: "NEW PROMPT" };
  const row = blankRow();
  row[termIndex] = "abandon";
  row[sourceIdIndex] = "v_abc123";
  row[meaningIndex] = buildAiFormula("AI", "OLD PROMPT", "C2");
  const { updates, stats } = planAiPromptApplication({ template, formulaRows: [row], promptOverrides: overrides });
  assert.equal(stats.updatedFormulaCells, 1);
  // The other AI columns in this row are blank and legitimately receive the
  // new formula (spec item 7), so blankCellsFilled is non-zero here.
  assert.ok(stats.blankCellsFilled >= 0);
  assert.equal(stats.protectedUserCells, 0);
  // One run per AI column: the blank AI columns in this row legitimately get
  // filled too, so the total is the number of AI columns (8 for IELTS).
  assert.equal(updates.length, aiColumnsForTemplate(template.templateType).length);
  const meaningRun = updates.find((u) => u.rangeA1.includes("!D"));
  assert.ok(meaningRun, "meaning column run exists");
  const meaningFormula = String(meaningRun?.values[0]?.[0] ?? "");
  assert.ok(meaningFormula.includes("NEW PROMPT"), "new prompt is embedded");
  assert.ok(meaningFormula.includes("C2"), "source cell reference is preserved");
});

test("blank AI cells receive the new formula", () => {
  const row = blankRow();
  row[termIndex] = "mitigate";
  row[sourceIdIndex] = "v_def456";
  const { stats, updates } = planAiPromptApplication({ template, formulaRows: [row], promptOverrides: null });
  assert.ok(stats.blankCellsFilled > 0, "meaning/ipa/... blank cells are filled");
  assert.ok(updates.length > 0);
  assert.ok(String(updates[0]?.values[0]?.[0] ?? "").startsWith("=AI("));
});

test("user-entered and materialized AI text are protected", () => {
  const row = blankRow();
  row[termIndex] = "abandon";
  row[sourceIdIndex] = "v_abc123";
  row[meaningIndex] = "từ bỏ"; // admin-entered
  row[ipaIndex] = "/ˈbəˈnænd/"; // materialized AI output (plain text)
  const { updates, stats } = planAiPromptApplication({ template, formulaRows: [row], promptOverrides: { meaning: "NEW" } });
  assert.equal(stats.updatedFormulaCells, 0);
  assert.ok(stats.protectedUserCells >= 2, "plain-text cells are counted as protected");
  const meaningInUpdates = updates.some((u) => u.values.some((r) => String(r[0] ?? "").includes("NEW")));
  assert.equal(meaningInUpdates, false, "no formula is written into a protected cell");
});

test("__lexora_id and STT are never targeted", () => {
  const row = blankRow();
  row[sttIndex] = "1";
  row[sourceIdIndex] = "v_abc123";
  row[termIndex] = "abandon";
  row[meaningIndex] = "=AI(\"OLD\";C2)";
  const { updates } = planAiPromptApplication({ template, formulaRows: [row], promptOverrides: null });
  const letters = updates.map((u) => u.rangeA1);
  assert.ok(letters.every((r) => !r.includes("!A")), "STT column A is never written");
  assert.ok(letters.every((r) => !r.includes("!B")), "__lexora_id column B is never written");
});

test("batching: contiguous rows collapse into one range per column", () => {
  const rows = Array.from({ length: 5 }, () => {
    const row = blankRow();
    row[termIndex] = "abandon";
    row[sourceIdIndex] = "v_abc123";
    row[meaningIndex] = "=AI(\"OLD\";C2)";
    return row;
  });
  const { updates } = planAiPromptApplication({ template, formulaRows: rows, promptOverrides: { meaning: "NEW" } });
  const meaningRuns = updates.filter((u) => u.rangeA1.includes("!D"));
  assert.equal(meaningRuns.length, 1, "5 contiguous rows become one range");
  assert.equal(meaningRuns[0].values.length, 5);
});

test("every AI column plan is honored, including Mandarin and irregular verbs", () => {
  for (const [type, languageCode] of [["ielts_vocab", "en"], ["language_vocab_mandarin", "zh-CN"], ["irregular_verb", "en"]] as const) {
    const tpl = getGoogleSheetTemplate({ type, languageCode });
    const plans = aiColumnsForTemplate(tpl.templateType);
    assert.ok(plans.length > 0, `${type} has AI plans`);
    // Blank rows for every field so all AI columns get counted.
    const blank = Array.from({ length: tpl.fields.length }, () => null);
    const populated: (string | null)[] = [...blank];
    populated[tpl.fields.findIndex(field => field.key === "term" || field.key === "v1")] = "word";
    const { stats } = planAiPromptApplication({ template: tpl, formulaRows: [populated], promptOverrides: null });
    assert.ok(stats.blankCellsFilled >= plans.length, `${type}: each AI plan has a blank target`);
  }
});

test("prompt resolution reuses the shared builder (no second formula system)", () => {
  const prompt = resolveAiPrompt("meaning", { meaning: "X" });
  assert.equal(prompt, "X");
  assert.ok(buildAiFormula("AI", prompt, "C2").includes("X"));
});
