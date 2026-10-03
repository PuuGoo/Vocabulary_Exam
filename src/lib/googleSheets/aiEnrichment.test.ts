import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { getGoogleSheetTemplate, SOURCE_ID_HEADER, STT_FIELD_KEY } from "@/lib/googleSheets/template";
import { aiColumnsForTemplate, AI_PROMPTS, buildAiColumnFormulas, buildAiFormula, aiColumnLetters, isAiEligibleField } from "@/lib/googleSheets/aiFormula";
import { isRawAiFormula, parseSheetGrid, readGeneratedValue } from "@/lib/googleSheets/parser";

const ielts = getGoogleSheetTemplate({ type: "ielts_vocab", languageCode: "en" });
const mandarin = getGoogleSheetTemplate({ type: "language_vocab_mandarin", languageCode: "zh-CN" });
const verbs = getGoogleSheetTemplate({ type: "irregular_verb", languageCode: "en" });

// ------------------------------------------------------------- 1/2/4/5: columns
test("1. every template keeps STT and __lexora_id as system-managed columns", () => {
  for (const template of [ielts, mandarin, verbs]) {
    assert.equal(template.fields[0].key, STT_FIELD_KEY);
    assert.equal(template.fields[1].key, SOURCE_ID_HEADER);
  }
});

test("2. AI columns are planned for every template", () => {
  assert.equal(aiColumnsForTemplate("ielts_vocab").length, 8);
  assert.equal(aiColumnsForTemplate("language_vocab_mandarin").length, 8);
  assert.equal(aiColumnsForTemplate("irregular_verb").length, 4);
});

test("4/5. AI formulas never target STT or __lexora_id", () => {
  for (const template of [ielts, mandarin, verbs]) {
    const letters = aiColumnLetters(template, template.templateType);
    assert.ok(!letters.has(STT_FIELD_KEY), `${template.templateType} must not plant AI into STT`);
    assert.ok(!letters.has(SOURCE_ID_HEADER), `${template.templateType} must not plant AI into ${SOURCE_ID_HEADER}`);
    // The STT column is the narrow display column, so its letter must never be
    // reported as an AI column.
    const sttIndex = template.fields.findIndex((field) => field.key === STT_FIELD_KEY);
    const sttLetter = String.fromCharCode(65 + sttIndex);
    assert.ok(![...letters.values()].includes(sttLetter), `${template.templateType} must not use the STT letter`);
  }
});

test("3. AI formulas are created in the intended columns", () => {
  const plan = aiColumnsForTemplate("ielts_vocab");
  const letters = aiColumnLetters(ielts, ielts.templateType);
  // Word = C, Meaning = D (meaning reads the Word cell C2).
  assert.equal(letters.get("meaning"), "D");
  const formulas = buildAiColumnFormulas(ielts, "AI", plan[0], 2);
  assert.equal(formulas.length, 2);
  assert.match(formulas[0], /^=AI\(/);
  assert.ok(formulas[0].includes("C2"), "the Meaning formula must read Word row 2");
  assert.ok(formulas[1].includes("C3"), "the Meaning formula must read Word row 3");
});

test("12. the function name is exactly =AI (never a server-side Gemini call)", () => {
  assert.equal(buildAiFormula("AI", "Prompt", "C2"), '=AI("Prompt";C2)');
  // The prompt quotes are escaped so Google Sheets accepts the literal.
  assert.equal(buildAiFormula("AI", 'Say "hi"', "C2"), '=AI("Say ""hi""";C2)');
});

test("exact prompts are field-specific", () => {
  assert.match(AI_PROMPTS.meaning, /Vietnamese meaning/i);
  assert.match(AI_PROMPTS.ipa, /IPA/i);
  assert.match(AI_PROMPTS.cefr, /A1, A2, B1, B2, C1, C2/);
  assert.match(AI_PROMPTS.ieltsBand, /blank if uncertain/i);
  assert.match(AI_PROMPTS.pinyin, /tone marks/i);
});

test("irregular verbs only AI-generate the safe fields, never the verb forms", () => {
  const plan = aiColumnsForTemplate("irregular_verb");
  const keys = plan.map((column) => column.key);
  for (const unsafe of ["v1", "v2", "v3"]) {
    assert.ok(!keys.includes(unsafe), `AI must never invent ${unsafe}`);
  }
  for (const safe of ["meaning", "ipaV1", "ipaV2", "ipaV3"]) {
    assert.ok(keys.includes(safe), `${safe} should be AI-eligible`);
  }
});

test("6. un-materialized AI formulas are never persisted as vocabulary text", () => {
  assert.equal(isRawAiFormula('=AI("Prompt";C2)'), true);
  assert.equal(isRawAiFormula('=Gemini("Prompt";C2)'), true);
  assert.equal(isRawAiFormula("giảm nhẹ"), false);
  assert.equal(isRawAiFormula("=SUM(A1:A2)"), false);
  assert.equal(readGeneratedValue('=AI("Prompt";C2)'), "", "a raw formula reads as empty");
  assert.equal(readGeneratedValue("giảm nhẹ"), "giảm nhẹ");

  // A raw formula in the Meaning column is skipped, not stored.
  const grid = {
    headers: ["STT", "__lexora_id", "Word", "Meaning"],
    rows: [
      ["1", "v_1", "mitigate", '=AI("Prompt";C2)'],
      ["2", "v_2", "abandon", "từ bỏ"],
    ],
  };
  const parsed = parseSheetGrid(grid, {
    templateType: "ielts_vocab",
    templateVersion: 2,
    sheetTitle: "Từ vựng IELTS",
    fields: [
      { key: STT_FIELD_KEY, header: "STT", width: 56, wrap: false, text: true, displayOnly: true },
      { key: SOURCE_ID_HEADER, header: SOURCE_ID_HEADER, width: 130, wrap: false, text: true },
      { key: "term", header: "Word", width: 180, wrap: false },
      { key: "meaning", header: "Meaning", width: 240, wrap: true },
    ],
  });
  assert.equal(parsed[0].values.meaning, "", "raw AI formula must not reach the word model");
  assert.equal(parsed[1].values.meaning, "từ bỏ", "materialized output is kept");
});

// ------------------------------------------------------- 9: no Lexora AI call
test("9. Lexora never calls an AI API for Google Sheets Sync", () => {
  const sources = [
    "src/lib/googleSheets/sheetLifecycle.ts",
    "src/lib/googleSheets/syncVocabulary.ts",
    "src/lib/googleSheets/aiFormula.ts",
    "src/lib/googleSheets/parser.ts",
    "src/lib/googleSheets/recovery.ts",
  ];
  // Comments legitimately name the forbidden symbols to explain the ban, so
  // the scan runs over code only: strip // and block comments first.
  const codeOf = (source: string) =>
    readFileSync(source, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const source of sources) {
    const text = codeOf(source);
    assert.ok(!text.includes("GEMINI_API_KEY"), `${source} must not read the Gemini API key`);
    assert.ok(!text.includes("GEMINI_API_KEYS"), `${source} must not read the Gemini API keys`);
    assert.ok(!text.includes("fetchIpaSingle"), `${source} must not call fetchIpaSingle`);
    assert.ok(!text.includes("fetchIpaBatch"), `${source} must not call fetchIpaBatch`);
    assert.ok(!text.includes("generativelanguage.googleapis.com"), `${source} must not call the Gemini API host`);
    assert.ok(!/from\s+["']@\/lib\/gemini["']/.test(text), `${source} must not import src/lib/gemini.ts`);
    assert.ok(!text.includes("process.env.GEMINI"), `${source} must not read any Gemini env var`);
  }
  // The sync engine never mentions AI generation as a Lexora responsibility.
  const lifecycle = readFileSync("src/lib/googleSheets/sheetLifecycle.ts", "utf8");
  assert.ok(!lifecycle.includes("generateWithGemini"), "the lifecycle must not have a Gemini generation step");
});

// ---------------------------------------------- 10: no AI webhook loop
test("10. AI generation cannot loop: sync never rewrites existing formulas", () => {
  const lifecycle = readFileSync("src/lib/googleSheets/sheetLifecycle.ts", "utf8");
  // New-row AI formulas are relayed only for the rows the sync just created.
  assert.match(lifecycle, /result\.aiFormulaWrites\?\.length/, "AI formulas are relayed only for new rows");
  assert.ok(!lifecycle.includes("for (const row of parsedRows)"), "the lifecycle must never rewrite every row's formulas");
});

// ------------------------------------------------------------- 7/8: sync values
test("7/8. materialized AI output syncs, user edits stay authoritative", () => {
  // The parser keeps whatever Google Sheets read: generated text or a manual
  // edit are identical from Lexora's point of view.
  const parsed = parseSheetGrid(
    {
      headers: ["STT", "__lexora_id", "Word", "Meaning"],
      rows: [
        ["1", "v_1", "mitigate", "giảm nhẹ"],
        ["2", "v_2", "abandon", "từ bỏ / bỏ rơi"],
      ],
    },
    {
      templateType: "ielts_vocab",
      templateVersion: 2,
      sheetTitle: "Từ vựng IELTS",
      fields: [
        { key: STT_FIELD_KEY, header: "STT", width: 56, wrap: false, text: true, displayOnly: true },
        { key: SOURCE_ID_HEADER, header: SOURCE_ID_HEADER, width: 130, wrap: false, text: true },
        { key: "term", header: "Word", width: 180, wrap: false },
        { key: "meaning", header: "Meaning", width: 240, wrap: true },
      ],
    },
  );
  assert.equal(parsed[0].values.meaning, "giảm nhẹ", "generated text is persisted");
  assert.equal(parsed[1].values.meaning, "từ bỏ / bỏ rơi", "the manual edit is never overwritten");
});

test("13. isAiEligibleField rejects system columns", () => {
  assert.equal(isAiEligibleField(ielts.fields[0]), false, "STT is not AI-eligible");
  assert.equal(isAiEligibleField(ielts.fields[1]), false, "__lexora_id is not AI-eligible");
  assert.equal(isAiEligibleField(ielts.fields.find((field) => field.key === "meaning")), true);
  assert.equal(isAiEligibleField(undefined), false);
});