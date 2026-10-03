import type { GoogleSheetTemplate, GoogleSheetTemplateField } from "@/lib/googleSheets/template";

/**
 * Google Sheets owns AI generation; Lexora only syncs.
 *
 * These formulas are the native Google Sheets AI functions (=AI / =Gemini).
 * Lexora never calls GEMINI_API_KEY, never posts to
 * generativelanguage.googleapis.com, and never runs fetchIpaSingle /
 * fetchIpaBatch for this feature.
 *
 * Only Google's *generated* text ever reaches PostgreSQL: the parser maps
 * headers by name and strips any leading "=" so an un-materialized formula
 * is never persisted as vocabulary text.
 */

export type AiFunctionName = "AI" | "Gemini";
export type AiPromptKey = "meaning" | "ipa" | "partOfSpeech" | "example" | "examplePronunciation" | "exampleMeaning" | "cefr" | "ieltsBand" | "pinyin" | "classifier" | "hsk";

/** Exact prompts, one per generated field. */
export const AI_PROMPTS: Record<AiPromptKey, string> = {
  meaning: "Provide the concise Vietnamese meaning for the exact English word. Return only the concise Vietnamese meaning.",
  ipa: "Provide the UK English IPA transcription for this exact word. Return only the IPA.",
  partOfSpeech: "Identify the part of speech of this word. Return only the standard grammatical label.",
  example: "Write one natural IELTS-appropriate English example sentence using this exact vocabulary word.",
  examplePronunciation: "Provide the UK English IPA pronunciation for this exact sentence. Return only the IPA.",
  exampleMeaning: "Translate this exact English example sentence into natural Vietnamese.",
  cefr: "Estimate the CEFR level of this English vocabulary word. Return only one of A1, A2, B1, B2, C1, C2. If uncertain, return blank.",
  ieltsBand: "Return the most appropriate IELTS vocabulary relevance band. Return blank if uncertain.",
  pinyin: "Provide the standard Pinyin with tone marks for this exact Chinese word. Do not guess tone.",
  classifier: "Provide the appropriate classifier if confidently known. Otherwise leave blank.",
  hsk: "Provide the HSK level only if confidently known. Otherwise leave blank.",
};

export type AiColumnPlan = { key: string; prompt: AiPromptKey; /** column that the formula reads as its input */ sourceKey: string };

/** The native AI formulas that Lexora can plant into a newly created Sheet. */
const IELTS_AI_COLUMNS: AiColumnPlan[] = [
  { key: "meaning", prompt: "meaning", sourceKey: "term" },
  { key: "ipa", prompt: "ipa", sourceKey: "term" },
  { key: "wtype", prompt: "partOfSpeech", sourceKey: "term" },
  { key: "example", prompt: "example", sourceKey: "term" },
  { key: "examplePronunciation", prompt: "examplePronunciation", sourceKey: "example" },
  { key: "exampleMeaning", prompt: "exampleMeaning", sourceKey: "example" },
  { key: "cefrLevel", prompt: "cefr", sourceKey: "term" },
  { key: "ieltsBandRelevance", prompt: "ieltsBand", sourceKey: "term" },
];

const MANDARIN_AI_COLUMNS: AiColumnPlan[] = [
  { key: "meaning", prompt: "meaning", sourceKey: "term" },
  { key: "pronunciation", prompt: "pinyin", sourceKey: "term" },
  { key: "wtype", prompt: "partOfSpeech", sourceKey: "term" },
  { key: "classifier", prompt: "classifier", sourceKey: "term" },
  { key: "level", prompt: "hsk", sourceKey: "term" },
  { key: "example", prompt: "example", sourceKey: "term" },
  { key: "examplePronunciation", prompt: "pinyin", sourceKey: "example" },
  { key: "exampleMeaning", prompt: "exampleMeaning", sourceKey: "example" },
];

/**
 * Irregular verbs: only the safe, non-inflected fields are AI-enriched.
 * V1/V2/V3 stay user-owned - AI must never invent an uncertain verb form.
 */
const IRREGULAR_AI_COLUMNS: AiColumnPlan[] = [
  { key: "meaning", prompt: "meaning", sourceKey: "v1" },
  { key: "ipaV1", prompt: "ipa", sourceKey: "v1" },
  { key: "ipaV2", prompt: "ipa", sourceKey: "v2" },
  { key: "ipaV3", prompt: "ipa", sourceKey: "v3" },
];

export function aiColumnsForTemplate(templateType: string): AiColumnPlan[] {
  if (templateType === "language_vocab_mandarin") return MANDARIN_AI_COLUMNS;
  if (templateType === "irregular_verb") return IRREGULAR_AI_COLUMNS;
  return IELTS_AI_COLUMNS;
}

function columnIndexOf(template: GoogleSheetTemplate, key: string): number {
  return template.fields.findIndex((field) => field.key === key);
}

/**
 * Build the literal `=AI("prompt"; A2)` / `=Gemini(...)` formula for one cell.
 *
 * Google's documented syntax is =AI("prompt", inputCell). Lexora spreadsheets
 * are created with locale vi_VN, so the argument separator is ";" (verified
 * against the Sheets API in the STT formula work).
 */
export function buildAiFormula(functionName: AiFunctionName, prompt: string, inputRef: string): string {
  const escapedPrompt = prompt.replace(/"/g, '""');
  return `=${functionName}("${escapedPrompt}";${inputRef})`;
}

/**
 * Row-scoped AI formulas for the whole AI-enabled body of one column.
 *
 * STT and __lexora_id are excluded by construction: `aiColumnsForTemplate`
 * only ever lists vocabulary fields, and `templateForAi` re-validates the key
 * against the template's non-display-only fields before building anything.
 */
export function buildAiColumnFormulas(template: GoogleSheetTemplate, functionName: AiFunctionName, plan: AiColumnPlan, rowCount: number, startRow: number = 2): string[] {
  const targetIndex = columnIndexOf(template, plan.key);
  const sourceIndex = columnIndexOf(template, plan.sourceKey);
  const formulas: string[] = [];
  if (targetIndex < 0 || sourceIndex < 0) return formulas;
  // Never plant AI into the system-managed columns.
  const target = template.fields[targetIndex];
  if (target.displayOnly || target.key === "__lexora_id") return formulas;
  const sourceLetter = columnLetterForIndex(sourceIndex);
  for (let row = startRow; row < startRow + rowCount; row += 1) {
    formulas.push(buildAiFormula(functionName, AI_PROMPTS[plan.prompt], `${sourceLetter}${row}`));
  }
  return formulas;
}

function columnLetterForIndex(index: number): string {
  let current = index + 1;
  let result = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}

/** Column letters for every AI-enabled field, keyed by field key. */
export function aiColumnLetters(template: GoogleSheetTemplate, templateType: string): Map<string, string> {
  const letters = new Map<string, string>();
  for (const plan of aiColumnsForTemplate(templateType)) {
    const index = columnIndexOf(template, plan.key);
    if (index < 0) continue;
    const field = template.fields[index];
    if (field.displayOnly) continue;
    letters.set(plan.key, columnLetterForIndex(index));
  }
  return letters;
}

/** Title of the in-Sheet help tab. */
export const AI_HELP_SHEET_TITLE = "Hướng dẫn AI";

/**
 * "AI điền nội dung còn thiếu" — the instructions the admin reads in the Sheet.
 *
 * These live in their own tab so they can never be parsed as vocabulary rows.
 * They describe Google Sheets' own AI function; the admin is never asked to
 * configure a Gemini API key, because generation happens inside Google Sheets.
 */
export function buildAiHelpRows(templateType: string): string[][] {
  const columns = aiColumnsForTemplate(templateType)
    .map((plan) => `${plan.key} → ${AI_PROMPTS[plan.prompt]}`)
    .join("\n");
  return [
    [AI_HELP_SHEET_TITLE],
    ["Google Sheets tạo nội dung AI. Lexora chỉ đồng bộ kết quả về."],
    [],
    ["Cách dùng"],
    ["1. Nhập Word vào cột Word của hàng tương ứng."],
    ["2. Các cột AI trong Sheet đã chứa công thức Google Sheets =AI(...) do Lexora chuẩn bị sẵn."],
    ["3. Chọn các ô AI nếu Google Sheets yêu cầu xác nhận phạm vi."],
    ["4. Dùng thao tác AI của Google Sheets: Generate and Insert, hoặc Refresh and Insert khi cần làm mới."],
    ["5. Google Sheets điền nội dung. Lexora tự động đồng bộ kết quả — không cần bấm đồng bộ thủ công."],
    [],
    ["AI điền nội dung còn thiếu"],
    ["1. Nhập Word."],
    ["2. Chọn các ô AI."],
    ["3. Generate and Insert."],
    ["4. Cần làm mới thì Refresh and Insert."],
    [],
    ["Lưu ý"],
    ["Nội dung bạn tự nhập luôn được giữ: AI không ghi đè dữ liệu đã có."],
    ["Lexora không gọi Gemini API. Mọi nội dung AI do Google Sheets tạo trong chính Sheet này."],
    ["Nếu một ô trống sau khi bạn dùng thao tác AI, hãy chọn ô đó và Generate and Insert lần nữa."],
    [],
    ["Cột AI và câu lệnh tương ứng"],
    [columns],
  ];
}

/** A field is AI-eligible only when it is a vocabulary field, never STT/__lexora_id. */
export function isAiEligibleField(field: GoogleSheetTemplateField | undefined): boolean {
  return !!field && !field.displayOnly && field.key !== "__lexora_id";
}