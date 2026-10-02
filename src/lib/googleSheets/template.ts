import type { VocabSetDescriptor } from "@/lib/vocabImport/parse";

export const GOOGLE_SHEET_TEMPLATE_VERSION = 2;
export const SOURCE_ID_HEADER = "__lexora_id";

/**
 * Display-only row number shown to humans in the Google Sheet.
 *
 * STT is NOT an identity: it is never persisted, never fingerprinted, never
 * used to resolve a word, and never compared during a sync. The column is
 * filled by a spreadsheet formula, so the numbers renumber themselves when
 * rows are added, removed, sorted or filtered.
 */
export const STT_HEADER = "STT";
export const STT_FIELD_KEY = "__stt";
export const SOURCE_ID_PREFIX = "v_";

export type GoogleSheetTemplateField = {
  key: string;
  header: string;
  width: number;
  wrap: boolean;
  text?: boolean;
  /**
   * Presentation-only column. It is written to the sheet but never mapped to a
   * database field, never fingerprinted and never part of vocabulary identity.
   */
  displayOnly?: boolean;
};

export type GoogleSheetTemplate = {
  templateType: string;
  templateVersion: number;
  sheetTitle: string;
  fields: GoogleSheetTemplateField[];
};

/** STT is always the first column; the formula fills the body. */
const STT_FIELD: GoogleSheetTemplateField = { key: STT_FIELD_KEY, header: STT_HEADER, width: 56, wrap: false, text: true, displayOnly: true };

const IELTS_FIELDS: GoogleSheetTemplateField[] = [
  STT_FIELD,
  { key: SOURCE_ID_HEADER, header: SOURCE_ID_HEADER, width: 130, wrap: false, text: true },
  { key: "term", header: "Word", width: 180, wrap: false },
  { key: "meaning", header: "Meaning", width: 240, wrap: true },
  { key: "ipa", header: "IPA", width: 120, wrap: false },
  { key: "wtype", header: "Part of Speech", width: 140, wrap: false },
  { key: "example", header: "Example", width: 300, wrap: true },
  { key: "examplePronunciation", header: "Example Pronunciation", width: 180, wrap: true },
  { key: "exampleMeaning", header: "Example Meaning", width: 260, wrap: true },
  { key: "level", header: "Level", width: 90, wrap: false },
  { key: "cefrLevel", header: "CEFR", width: 80, wrap: false, text: true },
  { key: "ieltsBandRelevance", header: "IELTS Band", width: 110, wrap: false, text: true },
  { key: "ieltsSkills", header: "IELTS Skills", width: 180, wrap: true },
  { key: "usageContext", header: "Usage Context", width: 160, wrap: true },
  { key: "register", header: "Register", width: 120, wrap: false },
  { key: "frequency", header: "Frequency", width: 110, wrap: false },
  { key: "notes", header: "Notes", width: 260, wrap: true },
];

const IRREGULAR_VERB_FIELDS: GoogleSheetTemplateField[] = [
  STT_FIELD,
  { key: SOURCE_ID_HEADER, header: SOURCE_ID_HEADER, width: 130, wrap: false, text: true },
  { key: "meaning", header: "Meaning", width: 260, wrap: true },
  { key: "v1", header: "V1", width: 140, wrap: false },
  { key: "v2", header: "V2", width: 140, wrap: false },
  { key: "v3", header: "V3", width: 140, wrap: false },
  { key: "ipaV1", header: "IPA V1", width: 120, wrap: false },
  { key: "ipaV2", header: "IPA V2", width: 120, wrap: false },
  { key: "ipaV3", header: "IPA V3", width: 120, wrap: false },
];

const MANDARIN_FIELDS: GoogleSheetTemplateField[] = [
  STT_FIELD,
  { key: SOURCE_ID_HEADER, header: SOURCE_ID_HEADER, width: 130, wrap: false, text: true },
  { key: "term", header: "Chữ Hán", width: 140, wrap: false },
  { key: "alternateTerm", header: "Phồn thể", width: 140, wrap: false },
  { key: "pronunciation", header: "Pinyin", width: 140, wrap: false, text: true },
  { key: "meaning", header: "Nghĩa", width: 240, wrap: true },
  { key: "wtype", header: "Loại từ", width: 120, wrap: false },
  { key: "classifier", header: "Lượng từ", width: 120, wrap: false },
  { key: "level", header: "HSK", width: 80, wrap: false, text: true },
  { key: "example", header: "Ví dụ", width: 260, wrap: true },
  { key: "examplePronunciation", header: "Pinyin ví dụ", width: 180, wrap: true, text: true },
  { key: "exampleMeaning", header: "Nghĩa ví dụ", width: 240, wrap: true },
  { key: "ipa", header: "IPA", width: 120, wrap: false },
  { key: "notes", header: "Notes", width: 220, wrap: true },
];

export function getGoogleSheetTemplate(set: Pick<VocabSetDescriptor, "type" | "languageCode">): GoogleSheetTemplate {
  if (set.type === "irregular_verb") {
    return { templateType: "irregular_verb", templateVersion: GOOGLE_SHEET_TEMPLATE_VERSION, sheetTitle: "Động từ bất quy tắc", fields: IRREGULAR_VERB_FIELDS };
  }
  if (set.languageCode === "zh-CN") {
    return { templateType: "language_vocab_mandarin", templateVersion: GOOGLE_SHEET_TEMPLATE_VERSION, sheetTitle: "Từ vựng tiếng Trung", fields: MANDARIN_FIELDS };
  }
  return { templateType: "ielts_vocab", templateVersion: GOOGLE_SHEET_TEMPLATE_VERSION, sheetTitle: "Từ vựng IELTS", fields: IELTS_FIELDS };
}

/** 0-based column index of the display-only STT column. */
export function sttColumnIndex(template: GoogleSheetTemplate): number {
  return Math.max(0, template.fields.findIndex((field) => field.key === STT_FIELD_KEY));
}

/** 0-based column index of the stable identity column. */
export function sourceIdColumnIndex(template: GoogleSheetTemplate): number {
  const index = template.fields.findIndex((field) => field.key === SOURCE_ID_HEADER);
  return index >= 0 ? index : sttColumnIndex(template) + 1;
}

function columnLetterOf(index: number): string {
  let current = index + 1;
  let result = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}

/**
 * Formula that numbers the visible vocabulary rows contiguously.
 *
 * It counts how many `__lexora_id` cells are filled from the first data row down
 * to the current one, so the sequence is always 1, 2, 3... with no gaps after a
 * delete, an insert, a sort or a filter. A row whose `__lexora_id` is still empty
 * (a brand new row the admin has not saved a word for yet) renders blank instead
 * of consuming a number, and the rows below renumber on their own.
 *
 * Position-based numbering was rejected: it leaves gaps when rows are blank.
 *
 * The reference is relative so Sheets shifts it for every row it is applied to.
 */
export function buildSttFormula(template: GoogleSheetTemplate, row: number = 2): string {
  const idColumn = columnLetterOf(sourceIdColumnIndex(template));
  return `=IF(${idColumn}${row}="","",COUNTIF($${idColumn}$2:${idColumn}${row},"<>"))`;
}

/** Same formula with the row reference advanced, for writing a filled column. */
export function buildSttFormulaForRow(template: GoogleSheetTemplate, row: number): string {
  return buildSttFormula(template, row);
}

export function getSheetTemplateColumnCount(template: GoogleSheetTemplate): number {
  return template.fields.length;
}
