import { normalizeText } from "@/lib/text";

/** Raw spreadsheet/CSV row keyed by lower-cased header. */
export type RawImportRow = Record<string, string>;

export type GeneralHeaderAliases = Readonly<Record<string, readonly string[]>>;

// Round-trip: Excel export produces friendly Vietnamese headers ("Tu","Nghia","Loai tu","Vi du","IPA","V1"/"IPA V1"...).
export const GENERAL_HEADERS: GeneralHeaderAliases = {
  term: ["term", "từ", "tu", "word", "từ vựng", "chữ hán", "chinh han", "simplified"],
  meaning: ["meaning", "nghĩa", "nghia", "nghĩa từ"],
  ipa: ["ipa", "phiên âm", "phien am"],
  wtype: ["wtype", "type", "word type", "loại từ", "loai tu", "từ loại", "tu loai"],
  example: ["example", "ví dụ", "vi du", "câu ví dụ", "cau vi du"],
  v1: ["v1"],
  v2: ["v2"],
  v3: ["v3"],
  ipa_v1: ["ipa_v1", "ipav1", "ipa v1"],
  ipa_v2: ["ipa_v2", "ipav2", "ipa v2"],
  ipa_v3: ["ipa_v3", "ipav3", "ipa v3"],
  alternateTerm: ["alternateterm", "alternate term", "traditional", "phồn thể", "phon the", "繁體", "繁体"],
  pronunciation: ["pronunciation", "pinyin", "拼音"],
  classifier: ["classifier", "lượng từ", "luong tu"],
  level: ["level", "hsk"],
  examplePronunciation: ["examplepronunciation", "example pronunciation", "pinyin ví dụ", "pinyin vi du"],
  exampleMeaning: ["examplemeaning", "example meaning", "nghĩa ví dụ", "nghia vi du"],
  notes: ["notes", "note", "ghi chú", "ghi chu", "注释"],
} as const;

function alias(row: RawImportRow, keys: readonly string[]): string {
  for (const key of keys) if (row[key]) return row[key];
  return "";
}

/** Map friendly EN/VI/中文 headers to the canonical internal keys used by `words`. */
export function canonicalGeneralRow(row: RawImportRow): RawImportRow {
  return {
    ...row,
    term: alias(row, GENERAL_HEADERS.term) || row.term || "",
    meaning: alias(row, GENERAL_HEADERS.meaning) || row.meaning || "",
    ipa: alias(row, GENERAL_HEADERS.ipa) || row.ipa || "",
    wtype: alias(row, GENERAL_HEADERS.wtype) || row.wtype || "",
    example: alias(row, GENERAL_HEADERS.example) || row.example || "",
    v1: alias(row, GENERAL_HEADERS.v1) || row.v1 || "",
    v2: alias(row, GENERAL_HEADERS.v2) || row.v2 || "",
    v3: alias(row, GENERAL_HEADERS.v3) || row.v3 || "",
    ipa_v1: alias(row, GENERAL_HEADERS.ipa_v1) || row.ipa_v1 || row.ipav1 || "",
    ipa_v2: alias(row, GENERAL_HEADERS.ipa_v2) || row.ipa_v2 || row.ipav2 || "",
    ipa_v3: alias(row, GENERAL_HEADERS.ipa_v3) || row.ipa_v3 || row.ipav3 || "",
    alternateTerm: alias(row, GENERAL_HEADERS.alternateTerm) || row.alternateTerm || "",
    pronunciation: alias(row, GENERAL_HEADERS.pronunciation) || row.pronunciation || "",
    classifier: alias(row, GENERAL_HEADERS.classifier) || row.classifier || "",
    level: alias(row, GENERAL_HEADERS.level) || row.level || "",
    examplePronunciation: alias(row, GENERAL_HEADERS.examplePronunciation) || row.examplePronunciation || "",
    exampleMeaning: alias(row, GENERAL_HEADERS.exampleMeaning) || row.exampleMeaning || "",
    notes: alias(row, GENERAL_HEADERS.notes) || row.notes || "",
  };
}

export const CHINESE_HEADERS = {
  term: ["term", "hanzi", "chữ hán", "chinese", "simplified", "简体", "生词"],
  alternateTerm: ["alternateterm", "alternate term", "traditional", "phồn thể", "繁體", "繁体"],
  pronunciation: ["pronunciation", "pinyin", "拼音"],
  meaning: ["meaning", "nghĩa", "意思", "词义"],
  wtype: ["wtype", "type", "word type", "loại từ", "词性"],
  classifier: ["classifier", "lượng từ"],
  level: ["level", "hsk"],
  example: ["example", "ví dụ", "例如"],
  examplePronunciation: ["examplepronunciation", "example pronunciation", "pinyin ví dụ"],
  exampleMeaning: ["examplemeaning", "example meaning", "nghĩa ví dụ"],
  notes: ["notes", "note", "ghi chú", "注释"],
} as const;

export function canonicalChineseRow(row: RawImportRow): RawImportRow {
  return {
    ...row,
    term: alias(row, CHINESE_HEADERS.term),
    alternateTerm: alias(row, CHINESE_HEADERS.alternateTerm),
    pronunciation: alias(row, CHINESE_HEADERS.pronunciation),
    meaning: alias(row, CHINESE_HEADERS.meaning),
    wtype: alias(row, CHINESE_HEADERS.wtype),
    classifier: alias(row, CHINESE_HEADERS.classifier),
    level: alias(row, CHINESE_HEADERS.level),
    example: alias(row, CHINESE_HEADERS.example),
    examplePronunciation: alias(row, CHINESE_HEADERS.examplePronunciation),
    exampleMeaning: alias(row, CHINESE_HEADERS.exampleMeaning),
    notes: alias(row, CHINESE_HEADERS.notes),
  };
}

/** Trim + NFC-normalize every cell, preserving header keys (lower-cased upstream). */
export function normalizeImportRow(raw: Record<string, unknown>): RawImportRow {
  const out: RawImportRow = {};
  for (const [key, value] of Object.entries(raw)) out[key.trim().toLowerCase()] = normalizeText(String(value ?? "").trim());
  return out;
}
