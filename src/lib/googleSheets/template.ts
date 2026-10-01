import type { VocabSetDescriptor } from "@/lib/vocabImport/parse";

export const GOOGLE_SHEET_TEMPLATE_VERSION = 1;
export const SOURCE_ID_HEADER = "__lexora_id";
export const SOURCE_ID_PREFIX = "v_";

export type GoogleSheetTemplateField = {
  key: string;
  header: string;
  width: number;
  wrap: boolean;
  text?: boolean;
};

export type GoogleSheetTemplate = {
  templateType: string;
  templateVersion: number;
  sheetTitle: string;
  fields: GoogleSheetTemplateField[];
};

const IELTS_FIELDS: GoogleSheetTemplateField[] = [
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

export function getSheetTemplateColumnCount(template: GoogleSheetTemplate): number {
  return template.fields.length;
}
