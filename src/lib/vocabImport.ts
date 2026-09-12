import { normalizeCefrLevel, normalizeContentKind, normalizeContentStatus, normalizeRegister, splitListCell } from "@/lib/vocabularyMeta";

/**
 * Advanced vocabulary import. The existing simple format keeps working
 * unchanged (term / meaning / ipa / example / wtype). Everything here is
 * optional and additive:
 *
 *  - extra columns on the same sheet, multi-value cells separated by "|" or ";";
 *  - or separate linked sheets (Collocations / Patterns / WordFamilies / Topics)
 *    joined by a stable `wordKey` (falling back to `term`), never by row number.
 */

export const MULTI_VALUE_SEPARATORS = /[|;]/;

export type AdvancedWordMeta = {
  contentKind?: string;
  contentStatus?: string;
  register?: string;
  cefrLevel?: string;
  frequency?: string;
  ieltsRelevant?: boolean;
  ieltsBandRelevance?: string;
  ieltsSkills?: string[];
  usageContext?: string[];
  notes?: string;
};

/** Lower-cased, punctuation-free header aliases accepted on the Words sheet. */
export const ADVANCED_COLUMN_ALIASES = {
  contentKind: ["contentkind", "kind"],
  contentStatus: ["contentstatus", "status"],
  register: ["register", "dangngu", "style"],
  cefrLevel: ["cefrlevel", "cefr"],
  frequency: ["frequency", "tansuat"],
  ieltsRelevant: ["ieltsrelevant", "ielts"],
  ieltsBandRelevance: ["ieltsbandrelevance", "ieltsband", "band"],
  ieltsSkills: ["ieltsskills", "ielts_skill", "ieltsskill"],
  usageContext: ["usagecontext", "usage"],
  notes: ["notes", "note", "ghichu"],
} as const satisfies Record<keyof AdvancedWordMeta, readonly string[]>;

export const WORD_KEY_ALIASES = ["wordkey", "key"] as const;
export const TERM_ALIASES = ["term", "word", "tu"] as const;

function pick(row: Record<string, string>, aliases: readonly string[]): string {
  for (const alias of aliases) {
    const value = row[alias];
    if (value !== undefined && value.trim() !== "") return value.trim();
  }
  return "";
}

export function readWordKey(row: Record<string, string>): string {
  return pick(row, WORD_KEY_ALIASES);
}

export function readTerm(row: Record<string, string>): string {
  return pick(row, TERM_ALIASES);
}

function parseBooleanCell(value: string): boolean | undefined {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (["1", "true", "yes", "y", "x", "có", "co"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "không", "khong"].includes(normalized)) return false;
  return undefined;
}

export function parseAdvancedWordMeta(row: Record<string, string>): AdvancedWordMeta {
  const meta: AdvancedWordMeta = {};
  const contentKind = normalizeContentKind(pick(row, ADVANCED_COLUMN_ALIASES.contentKind));
  if (contentKind) meta.contentKind = contentKind;
  const contentStatus = normalizeContentStatus(pick(row, ADVANCED_COLUMN_ALIASES.contentStatus));
  if (contentStatus) meta.contentStatus = contentStatus;
  const register = normalizeRegister(pick(row, ADVANCED_COLUMN_ALIASES.register));
  if (register) meta.register = register;
  const cefr = normalizeCefrLevel(pick(row, ADVANCED_COLUMN_ALIASES.cefrLevel));
  if (cefr) meta.cefrLevel = cefr;
  const frequency = pick(row, ADVANCED_COLUMN_ALIASES.frequency);
  if (frequency) meta.frequency = frequency.slice(0, 24);
  const relevant = parseBooleanCell(pick(row, ADVANCED_COLUMN_ALIASES.ieltsRelevant));
  if (relevant !== undefined) meta.ieltsRelevant = relevant;
  const band = pick(row, ADVANCED_COLUMN_ALIASES.ieltsBandRelevance);
  if (band) meta.ieltsBandRelevance = band.slice(0, 16);
  const skills = splitListCell(pick(row, ADVANCED_COLUMN_ALIASES.ieltsSkills));
  if (skills.length) meta.ieltsSkills = skills;
  const usage = splitListCell(pick(row, ADVANCED_COLUMN_ALIASES.usageContext));
  if (usage.length) meta.usageContext = usage;
  const notes = pick(row, ADVANCED_COLUMN_ALIASES.notes);
  if (notes) meta.notes = notes;
  return meta;
}

/** Inline multi-value cells, e.g. `collocation` = "make a decision | reach a decision". */
export function splitMultiValueCell(value: string | null | undefined): string[] {
  return splitListCell(value);
}

export type LinkedSheetKind = "collocations" | "patterns" | "wordfamilies" | "topics";

const SHEET_ALIASES: Record<LinkedSheetKind | "words", string[]> = {
  words: ["words", "tuvung", "vocabulary", "vocab"],
  collocations: ["collocations", "collocation", "cumtu"],
  patterns: ["patterns", "pattern", "cautruc"],
  wordfamilies: ["wordfamilies", "wordfamily", "families", "family", "hotu"],
  topics: ["topics", "topic", "chude"],
};

export function detectSheetKind(name: string | null | undefined): LinkedSheetKind | "words" | null {
  const normalized = (name || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!normalized) return null;
  for (const [kind, aliases] of Object.entries(SHEET_ALIASES)) {
    if (aliases.some((alias) => alias.replace(/[^a-z0-9]/g, "") === normalized)) return kind as LinkedSheetKind | "words";
  }
  return null;
}

export type CollocationImportRow = {
  wordKey: string;
  term: string;
  phrase: string;
  meaning: string | null;
  example: string | null;
  register: string | null;
  contentStatus: string;
};

export type PatternImportRow = {
  wordKey: string;
  term: string;
  pattern: string;
  meaning: string | null;
  example: string | null;
  contentStatus: string;
};

export type FamilyImportRow = { wordKey: string; term: string; family: string; relation: string | null };
export type TopicImportRow = { wordKey: string; term: string; topic: string };

const PHRASE_ALIASES = ["phrase", "collocation", "cum", "cumtu"] as const;
const PATTERN_ALIASES = ["pattern", "cautruc", "structure"] as const;
const MEANING_ALIASES = ["meaning", "nghia", "vn", "vietnamese"] as const;
const EXAMPLE_ALIASES = ["example", "vidu", "ex"] as const;
const FAMILY_ALIASES = ["family", "wordfamily", "familyrole", "hotu", "label"] as const;
const RELATION_ALIASES = ["relation", "role", "familyrole", "type", "vaitro"] as const;
const TOPIC_ALIASES = ["topic", "topics", "chude"] as const;
const REGISTER_ALIASES = ["register", "style"] as const;
const STATUS_ALIASES = ["contentstatus", "status"] as const;

function optional(row: Record<string, string>, aliases: readonly string[]): string | null {
  const value = pick(row, aliases);
  return value || null;
}

export function parseCollocationRows(rows: readonly Record<string, string>[]): CollocationImportRow[] {
  const result: CollocationImportRow[] = [];
  for (const row of rows) {
    const phrase = pick(row, PHRASE_ALIASES);
    if (!phrase) continue;
    result.push({
      wordKey: readWordKey(row),
      term: readTerm(row),
      phrase,
      meaning: optional(row, MEANING_ALIASES),
      example: optional(row, EXAMPLE_ALIASES),
      register: normalizeRegister(optional(row, REGISTER_ALIASES) || ""),
      contentStatus: normalizeContentStatus(optional(row, STATUS_ALIASES) || "") ?? "approved",
    });
  }
  return result;
}

export function parsePatternRows(rows: readonly Record<string, string>[]): PatternImportRow[] {
  const result: PatternImportRow[] = [];
  for (const row of rows) {
    const pattern = pick(row, PATTERN_ALIASES);
    if (!pattern) continue;
    result.push({
      wordKey: readWordKey(row),
      term: readTerm(row),
      pattern,
      meaning: optional(row, MEANING_ALIASES),
      example: optional(row, EXAMPLE_ALIASES),
      contentStatus: normalizeContentStatus(optional(row, STATUS_ALIASES) || "") ?? "approved",
    });
  }
  return result;
}

export function parseFamilyRows(rows: readonly Record<string, string>[]): FamilyImportRow[] {
  const result: FamilyImportRow[] = [];
  for (const row of rows) {
    const family = pick(row, FAMILY_ALIASES);
    if (!family) continue;
    result.push({ wordKey: readWordKey(row), term: readTerm(row), family, relation: optional(row, RELATION_ALIASES) });
  }
  return result;
}

export function parseTopicRows(rows: readonly Record<string, string>[]): TopicImportRow[] {
  const result: TopicImportRow[] = [];
  for (const row of rows) {
    for (const topic of splitListCell(pick(row, TOPIC_ALIASES))) {
      result.push({ wordKey: readWordKey(row), term: readTerm(row), topic });
    }
  }
  return result;
}

/**
 * Resolves a linked row to a word id. `wordKey` wins because it survives
 * sorting and filtering; `term` is the documented fallback.
 */
export function resolveLinkedWordId(
  row: { wordKey: string; term: string },
  byWordKey: ReadonlyMap<string, number>,
  byTerm: ReadonlyMap<string, number>,
): number | null {
  if (row.wordKey) {
    const mapped = byWordKey.get(row.wordKey.trim().toLowerCase());
    if (mapped) return mapped;
  }
  if (row.term) return byTerm.get(row.term.trim().toLowerCase()) ?? null;
  return null;
}

export function indexByWordKey(rows: ReadonlyArray<Record<string, string>>, ids: readonly number[]) {
  const map = new Map<string, number>();
  rows.forEach((row, index) => {
    const key = readWordKey(row).toLowerCase();
    const id = ids[index];
    if (key && id && !map.has(key)) map.set(key, id);
  });
  return map;
}

export function indexByTerm(rows: ReadonlyArray<{ term: string | null; id: number }>) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = (row.term || "").trim().toLowerCase();
    if (key && !map.has(key)) map.set(key, row.id);
  }
  return map;
}
