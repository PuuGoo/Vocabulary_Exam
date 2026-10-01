import type { words } from "@/db/schema";
import { canonicalizePinyinDisplay, hasExplicitPinyinTone } from "@/lib/pinyin";
import { normalizeText } from "@/lib/text";
import { importWordKey } from "@/lib/importDedup";
import { canonicalChineseRow, normalizeImportRow, type RawImportRow } from "@/lib/vocabImport/headerAliases";
import { getFillPatternValidationError } from "@/lib/fillAnswer";
import { normalizeCefrLevel, normalizeContentKind, normalizeContentStatus, normalizeRegister, splitListCell, stringifyListColumn } from "@/lib/vocabularyMeta";

export type VocabSetDescriptor = { id: number; type: string; languageCode: string; translationLanguageCode?: string | null; languageSettings?: unknown };

export type ParsedWordDraft = {
  setId: number;
  rowNumber: number;
  meaning: string;
  term: string | null;
  v1: string | null;
  v2: string | null;
  v3: string | null;
  ipaV1: string | null;
  ipaV2: string | null;
  ipaV3: string | null;
  example: string | null;
  examplePronunciation: string | null;
  exampleMeaning: string | null;
  wtype: string | null;
  ipa: string | null;
  alternateTerm: string | null;
  pronunciation: string | null;
  classifier: string | null;
  level: string | null;
  register: string | null;
  cefrLevel: string | null;
  frequency: string | null;
  contentKind: string | null;
  contentStatus: string | null;
  ieltsRelevant: boolean;
  ieltsBandRelevance: string | null;
  ieltsSkills: string;
  usageContext: string;
  notes: string | null;
};

export type VocabularyImportIssue = { rowNumber: number; message: string; code: string };

export type ParsedVocabularyRows = {
  rows: ParsedWordDraft[];
  invalidCount: number;
  duplicateCount: number;
  issues: VocabularyImportIssue[];
  pinyinWarningRows: number[];
};

export type ParseVocabularyOptions = {
  /**
   * CSV/XLSX import is append-only, so an identity that already exists in the
   * set is a DUPLICATE. Google Sheets Sync is different: the same identity must
   * resolve to the existing word so an edit becomes an UPDATE, never a new row.
   */
  dedupeAgainstExisting?: boolean;
};

function clean(value: unknown): string {
  return normalizeText(String(value ?? "").trim());
}
function nullable(value: unknown): string | null {
  const cleaned = clean(value);
  return cleaned === "" ? null : cleaned;
}
function boolCell(value: unknown): boolean {
  return ["1", "true", "yes", "y", "x", "có", "co"].includes(clean(value).toLocaleLowerCase("en"));
}
function listCell(value: unknown): string {
  const raw = clean(value);
  if (!raw) return "[]";
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return stringifyListColumn(parsed.map((item) => clean(item)));
  } catch { /* plain-text cell */ }
  return stringifyListColumn(splitListCell(raw));
}

/**
 * Shared normalization/validation pipeline for CSV/XLSX import and Google
 * Sheets Sync: the same input cell always produces the same canonical draft.
 */
export function parseVocabularyRows(
  rawRows: readonly Record<string, unknown>[],
  set: VocabSetDescriptor,
  existingKeys: Iterable<string>,
  options: ParseVocabularyOptions = {},
): ParsedVocabularyRows {
  const dedupeAgainstExisting = options.dedupeAgainstExisting !== false;
  const seenKeys = new Set(existingKeys);
  const issues: VocabularyImportIssue[] = [];
  const pinyinWarningRows: number[] = [];
  const drafts: ParsedWordDraft[] = [];
  const isChinese = set.languageCode === "zh-CN";

  rawRows.forEach((rawRow, index) => {
    const rowNumber = index + 2; // spreadsheet row 1 is the header
    let row: RawImportRow = normalizeImportRow(rawRow);
    if (isChinese) row = canonicalChineseRow(row);
    if (!Object.values(row).some((value) => value !== "")) return; // blank row

    const draft: ParsedWordDraft = {
      setId: set.id,
      rowNumber,
      meaning: clean(row.meaning),
      term: nullable(row.term),
      v1: nullable(row.v1),
      v2: nullable(row.v2),
      v3: nullable(row.v3),
      ipaV1: nullable(row.ipa_v1),
      ipaV2: nullable(row.ipa_v2),
      ipaV3: nullable(row.ipa_v3),
      example: nullable(row.example),
      examplePronunciation: nullable(row.examplePronunciation),
      exampleMeaning: nullable(row.exampleMeaning),
      wtype: nullable(row.wtype),
      ipa: nullable(row.ipa),
      alternateTerm: nullable(row.alternateTerm),
      pronunciation: nullable(row.pronunciation),
      classifier: nullable(row.classifier),
      level: nullable(row.level),
      register: nullable(row.register),
      cefrLevel: nullable(row.cefrlevel),
      frequency: nullable(row.frequency),
      contentKind: nullable(row.contentkind) || nullable(row.kind),
      contentStatus: nullable(row.contentstatus) || nullable(row.status),
      ieltsRelevant: boolCell(row.ieltsrelevant),
      ieltsBandRelevance: nullable(row.ieltsbandrelevance) || nullable(row.ieltsband) || nullable(row.band),
      ieltsSkills: listCell(row.ieltsskills),
      usageContext: listCell(row.usagecontext),
      notes: nullable(row.notes),
    };

    const key = importWordKey({ term: draft.term, v1: draft.v1, v2: draft.v2, v3: draft.v3 }, set.type);

    if (set.type === "irregular_verb") {
      if (!draft.meaning || !draft.v1 || !draft.v2 || !draft.v3) {
        issues.push({ rowNumber, code: "REQUIRED_FIELDS_MISSING", message: "Dòng thiếu nghĩa, V1, V2 hoặc V3." });
        return;
      }
    } else if (!draft.term || !draft.meaning) {
      issues.push({ rowNumber, code: "REQUIRED_FIELDS_MISSING", message: "Dòng thiếu từ vựng hoặc nghĩa." });
      return;
    }

    if (set.type !== "irregular_verb" && draft.term && draft.wtype) {
      const patternError = getFillPatternValidationError(draft.term, draft.wtype);
      if (patternError) {
        issues.push({ rowNumber, code: "INVALID_PATTERN", message: patternError });
        return;
      }
    }

    if (key && seenKeys.has(key)) {
      if (!dedupeAgainstExisting) {
        // Identity resolution, not a duplicate: the sync engine maps this row to
        // the existing word so the edit becomes an UPDATE on the same wordId.
        drafts.push(draft);
        return;
      }
      issues.push({ rowNumber, code: "DUPLICATE", message: `Dòng trùng với từ vựng đã có (${key}).` });
      return;
    }
    if (key) seenKeys.add(key);

    if (isChinese && draft.pronunciation) {
      draft.pronunciation = canonicalizePinyinDisplay(draft.pronunciation);
      if (!hasExplicitPinyinTone(draft.pronunciation)) pinyinWarningRows.push(rowNumber);
    }
    if (isChinese && draft.examplePronunciation) draft.examplePronunciation = canonicalizePinyinDisplay(draft.examplePronunciation);

    if (draft.contentKind) draft.contentKind = normalizeContentKind(draft.contentKind) || null;
    if (draft.contentStatus) draft.contentStatus = normalizeContentStatus(draft.contentStatus) || null;
    if (draft.register) draft.register = normalizeRegister(draft.register) || null;
    if (draft.cefrLevel) draft.cefrLevel = normalizeCefrLevel(draft.cefrLevel) || null;
    drafts.push(draft);
  });

  return {
    rows: drafts,
    invalidCount: issues.filter((issue) => issue.code !== "DUPLICATE").length,
    duplicateCount: issues.filter((issue) => issue.code === "DUPLICATE").length,
    issues,
    pinyinWarningRows,
  };
}

/** Back-compat adapter used by the existing CSV/XLSX route. */
export function canonicalizeRowsForImport(rawRows: readonly Record<string, unknown>[], languageCode: string): RawImportRow[] {
  const normalized = rawRows.map(normalizeImportRow);
  return languageCode === "zh-CN" ? normalized.map(canonicalChineseRow) : normalized;
}

export function draftToWordInsert(draft: ParsedWordDraft): Omit<typeof words.$inferInsert, "position"> {
  return {
    setId: draft.setId,
    meaning: draft.meaning,
    term: draft.term,
    v1: draft.v1,
    v2: draft.v2,
    v3: draft.v3,
    ipaV1: draft.ipaV1,
    ipaV2: draft.ipaV2,
    ipaV3: draft.ipaV3,
    example: draft.example,
    examplePronunciation: draft.examplePronunciation,
    exampleMeaning: draft.exampleMeaning,
    wtype: draft.wtype,
    ipa: draft.ipa,
    alternateTerm: draft.alternateTerm,
    pronunciation: draft.pronunciation,
    classifier: draft.classifier,
    level: draft.level,
    register: draft.register,
    cefrLevel: draft.cefrLevel,
    frequency: draft.frequency,
    contentKind: draft.contentKind ?? undefined,
    contentStatus: draft.contentStatus ?? undefined,
    ieltsRelevant: draft.ieltsRelevant,
    ieltsBandRelevance: draft.ieltsBandRelevance,
    ieltsSkills: draft.ieltsSkills,
    usageContext: draft.usageContext,
    notes: draft.notes,
  };
}

export { canonicalChineseRow, normalizeImportRow };
export type { RawImportRow };
