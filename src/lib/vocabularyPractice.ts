import type { MistakeReason } from "@/db/schema";
import { gradeFillAnswer, getAcceptedAnswers, normalizeFillAnswer } from "@/lib/fillAnswer";
import { MISTAKE_REASON_FOR_SKILL, type WordSkill } from "@/lib/wordSkills";

/**
 * Content-driven practice items for the deeper vocabulary dimensions
 * (collocation, pattern, context). Every answer key comes from authored data —
 * nothing here rewrites, infers or fuzzy-accepts English.
 */

export const BLANK = "______";

export type PracticeWord = {
  id: number;
  term?: string | null;
  meaning?: string | null;
  example?: string | null;
  wtype?: string | null;
  ipa?: string | null;
};

export type CollocationContent = { id?: number | null; phrase: string; meaning?: string | null; example?: string | null };
export type PatternContent = { id?: number | null; pattern: string; meaning?: string | null; example?: string | null };

type ItemBase = {
  id: string;
  wordId: number;
  term: string;
  meaning: string;
  prompt: string;
  answerKey: string;
  /** Full canonical form shown in feedback, e.g. "make a decision". */
  canonical: string;
  hint?: string | null;
  example?: string | null;
};

export type CollocationItem = ItemBase & {
  kind: "collocation";
  task: "blank" | "phrase";
  skill: "collocation_usage";
  collocationId: number | null;
};

export type PatternItem = ItemBase & {
  kind: "pattern";
  task: "frame" | "recall";
  skill: "pattern_usage";
  patternId: number | null;
};

export type ClozeItem = ItemBase & {
  kind: "cloze";
  task: "example";
  skill: "context_usage";
  capitalized: boolean;
};

export type VocabularyItem = CollocationItem | PatternItem | ClozeItem;
export type VocabularyItemKind = VocabularyItem["kind"];

export const ITEM_SKILLS: Record<VocabularyItemKind, WordSkill> = {
  collocation: "collocation_usage",
  pattern: "pattern_usage",
  cloze: "context_usage",
};

export const ITEM_KIND_LABELS: Record<VocabularyItemKind, string> = {
  collocation: "Collocation",
  pattern: "Cấu trúc",
  cloze: "Ngữ cảnh",
};

function collapse(value: string | null | undefined) {
  return (value || "").normalize("NFC").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordTokenRegex(token: string) {
  return new RegExp(`(?<![\\p{L}'-])${escapeRegExp(token)}(?![\\p{L}'-])`, "giu");
}

function blankOut(source: string, match: string) {
  return source.replace(wordTokenRegex(match), BLANK);
}

/** Tokens that are structural rather than lexical, used when picking a blank. */
const PATTERN_FUNCTION_TOKENS = new Set([
  "sb", "sth", "somebody", "someone", "something", "swh", "doing", "do", "to", "be", "being", "v", "v-ing",
  "the", "a", "an", "of", "oneself", "sb's", "sth's",
]);

const FRAME_PREPOSITIONS = new Set([
  "for", "from", "in", "on", "at", "to", "with", "about", "of", "into", "onto", "upon", "against",
  "between", "among", "through", "over", "out", "up", "down", "off", "away", "back", "by", "as", "than",
]);

const GERUND_MARKERS = new Set(["doing", "v-ing", "-ing", "making", "being"]);

export function buildCollocationItems(word: PracticeWord, collocations: readonly CollocationContent[]): CollocationItem[] {
  const term = collapse(word.term);
  const meaning = collapse(word.meaning);
  if (!term) return [];
  const accepted = getAcceptedAnswers(term);
  const items: CollocationItem[] = [];

  for (const collocation of collocations) {
    const phrase = collapse(collocation.phrase);
    if (phrase.split(" ").length < 2) continue;
    const collocationId = typeof collocation.id === "number" ? collocation.id : null;
    const base = {
      wordId: word.id, term, meaning, canonical: phrase,
      example: collapse(collocation.example) || null,
      kind: "collocation" as const, skill: "collocation_usage" as const, collocationId,
    };

    const phraseMeaning = collapse(collocation.meaning);
    if (phraseMeaning) {
      items.push({
        ...base, id: `collocation:${word.id}:${collocationId ?? phrase}:phrase`, task: "phrase",
        prompt: phraseMeaning, answerKey: phrase,
        hint: `${phrase.split(" ").length} từ · bắt đầu bằng “${phrase.split(" ")[0]}”`,
      });
    }

    const match = accepted
      .map((candidate) => phrase.match(wordTokenRegex(candidate)))
      .find((found): found is RegExpMatchArray => Boolean(found));
    const target = match ? match[0] : phrase.split(" ").filter((token) => !PATTERN_FUNCTION_TOKENS.has(token.toLowerCase())).sort((a, b) => b.length - a.length)[0];
    if (!target || target.length < 2) continue;
    const prompt = blankOut(phrase, target);
    if (prompt === phrase) continue;
    items.push({
      ...base, id: `collocation:${word.id}:${collocationId ?? phrase}:blank`, task: "blank",
      prompt, answerKey: target,
      hint: `${target.length} ký tự`,
    });
  }
  return items;
}

export function buildPatternItems(word: PracticeWord, patterns: readonly PatternContent[]): PatternItem[] {
  const term = collapse(word.term);
  const meaning = collapse(word.meaning);
  if (!term) return [];
  const sources = patterns.length ? patterns : patternSourcesFromWordType(word.wtype);
  const items: PatternItem[] = [];

  for (const source of sources) {
    for (const variant of splitPatternVariants(source.pattern)) {
      const pattern = collapse(variant);
      if (pattern.split(" ").length < 2) continue;
      const patternId = typeof source.id === "number" ? source.id : null;
      const sourceMeaning = collapse(source.meaning);
      const base = {
        wordId: word.id, term, meaning, canonical: pattern,
        example: collapse(source.example) || null,
        kind: "pattern" as const, skill: "pattern_usage" as const, patternId,
      };
      const frame = buildPatternFrame(pattern);
      if (frame) {
        items.push({
          ...base, id: `pattern:${word.id}:${patternId ?? pattern}:frame:${frame.answer}`, task: "frame",
          prompt: frame.prompt, answerKey: frame.answer, hint: frame.hint,
        });
      }
      items.push({
        ...base, id: `pattern:${word.id}:${patternId ?? pattern}:recall`, task: "recall",
        prompt: sourceMeaning || meaning, answerKey: pattern,
        hint: `${pattern.split(" ").length} thành phần · với “${term}”`,
      });
    }
  }
  return items;
}

/** Existing `wtype` values that already encode a grammar frame stay usable. */
export function patternSourcesFromWordType(wtype: string | null | undefined): PatternContent[] {
  const value = collapse(wtype);
  if (!value) return [];
  const looksLikePattern = value.includes(";") || /\b(sb|sth|somebody|something|doing sth|to do sth|v-ing)\b/i.test(value);
  if (!looksLikePattern) return [];
  return [{ id: null, pattern: value, meaning: null, example: null }];
}

/** Multi-group patterns keep their authored `;` semantics: each group is its own truth. */
export function splitPatternVariants(pattern: string | null | undefined): string[] {
  return collapse(pattern).split(";").map((part) => part.trim()).filter(Boolean);
}

export type PatternFrame = { prompt: string; answer: string; hint: string };

/**
 * Deterministically derive one testable slot (preposition, gerund or infinitive
 * marker) from an authored pattern. The answer always comes from the source
 * string, so grading never needs grammar inference.
 */
export function buildPatternFrame(pattern: string | null | undefined): PatternFrame | null {
  const value = collapse(pattern);
  const tokens = value.split(" ");
  if (tokens.length < 3) return null;

  const stripped = tokens.map((token) => token.replace(/[^A-Za-z'-]/g, "").toLowerCase());
  const findIndex = (candidates: Set<string>) => stripped.findIndex((token, index) => index > 0 && candidates.has(token));

  let index = findIndex(FRAME_PREPOSITIONS);
  let hint = "Giới từ";
  if (index < 0) {
    index = findIndex(GERUND_MARKERS);
    hint = "Danh động từ";
  }
  if (index < 0) return null;

  const raw = tokens[index];
  const answer = raw.replace(/^[^A-Za-z'-]+|[^A-Za-z'-]+$/g, "");
  if (!answer) return null;
  const replacement = raw.replace(answer, BLANK);
  const prompt = [...tokens.slice(0, index), replacement, ...tokens.slice(index + 1)].join(" ");
  return { prompt, answer, hint };
}

const MARKUP_GUARD = /[<>*_`[\]{}|]/;
const MAX_CLOZE_LENGTH = 240;
const MIN_CLOZE_TOKENS = 3;

export type ClozeEligibility = { eligible: true; prompt: string; capitalized: boolean } | { eligible: false; reason: string };

/**
 * A cloze is only created from an authored example where the target occurs as a
 * whole word and blanking it cannot damage markup or punctuation.
 */
export function buildClozeEligibility(word: Pick<PracticeWord, "term" | "example">): ClozeEligibility {
  const term = collapse(word.term);
  const example = collapse(word.example);
  if (!term || !example) return { eligible: false, reason: "missing_content" };
  if (MARKUP_GUARD.test(example)) return { eligible: false, reason: "markup" };
  if (example.length > MAX_CLOZE_LENGTH) return { eligible: false, reason: "too_long" };
  if (example.includes(BLANK)) return { eligible: false, reason: "already_blank" };

  const accepted = getAcceptedAnswers(term);
  const matches = accepted.flatMap((candidate) => [...example.matchAll(wordTokenRegex(candidate))]);
  if (!matches.length) return { eligible: false, reason: "term_not_found" };
  if (example.split(/\s+/).length < MIN_CLOZE_TOKENS) return { eligible: false, reason: "too_short" };

  let prompt = example;
  for (const candidate of accepted) prompt = blankOut(prompt, candidate);
  if (prompt === example) return { eligible: false, reason: "term_not_found" };
  const capitalized = matches.some((match) => /^[A-Z]/.test(match[0]) && match.index === 0);
  return { eligible: true, prompt, capitalized };
}

export function buildClozeItem(word: PracticeWord): ClozeItem | null {
  const eligibility = buildClozeEligibility(word);
  if (!eligibility.eligible) return null;
  const term = collapse(word.term);
  return {
    kind: "cloze", task: "example", skill: "context_usage",
    id: `cloze:${word.id}`, wordId: word.id, term,
    meaning: collapse(word.meaning), prompt: eligibility.prompt, answerKey: term,
    canonical: collapse(word.example), example: collapse(word.example),
    capitalized: eligibility.capitalized,
    hint: `${term.length} ký tự`,
  };
}

export function buildVocabularyItems(input: {
  words: readonly PracticeWord[];
  collocationsByWordId?: ReadonlyMap<number, readonly CollocationContent[]>;
  patternsByWordId?: ReadonlyMap<number, readonly PatternContent[]>;
  kinds?: readonly VocabularyItemKind[];
}): VocabularyItem[] {
  const kinds = input.kinds || (["collocation", "pattern", "cloze"] as const);
  const items: VocabularyItem[] = [];
  for (const word of input.words) {
    if (kinds.includes("collocation")) {
      items.push(...buildCollocationItems(word, input.collocationsByWordId?.get(word.id) || []));
    }
    if (kinds.includes("pattern")) {
      items.push(...buildPatternItems(word, input.patternsByWordId?.get(word.id) || []));
    }
    if (kinds.includes("cloze")) {
      const cloze = buildClozeItem(word);
      if (cloze) items.push(cloze);
    }
  }
  return items;
}

export type VocabularyGrade = {
  correct: boolean;
  nearMiss: boolean;
  acceptedAnswers: string[];
  reason: MistakeReason;
  skill: WordSkill;
  canonical: string;
  feedbackLabel: string;
};

const FEEDBACK_LABELS: Record<VocabularyItemKind, string> = {
  collocation: "Chưa đúng collocation",
  pattern: "Chưa đúng cấu trúc",
  cloze: "Chưa đúng từ trong ngữ cảnh",
};

/** Controlled grading: normalized exact match against authored accepted forms only. */
export function gradeVocabularyItem(item: VocabularyItem, answer: string): VocabularyGrade {
  const grade = gradeFillAnswer(answer, item.answerKey);
  return {
    ...grade,
    reason: MISTAKE_REASON_FOR_SKILL[item.skill],
    skill: item.skill,
    canonical: item.canonical,
    feedbackLabel: FEEDBACK_LABELS[item.kind],
  };
}

export function isItemAnswered(item: VocabularyItem, answer: string | undefined) {
  return normalizeFillAnswer(answer || "") !== "";
}

/**
 * Interleave item kinds so one session never asks the same dimension four times
 * in a row, while keeping each kind's internal order stable.
 */
export function interleaveItems(items: readonly VocabularyItem[]): VocabularyItem[] {
  const queues = new Map<VocabularyItemKind, VocabularyItem[]>();
  for (const item of items) queues.set(item.kind, [...(queues.get(item.kind) || []), item]);
  const kinds = [...queues.keys()].sort((left, right) => (queues.get(right)!.length) - (queues.get(left)!.length));
  const output: VocabularyItem[] = [];
  let remaining = items.length;
  while (remaining > 0) {
    for (const kind of kinds) {
      const queue = queues.get(kind)!;
      const next = queue.shift();
      if (!next) continue;
      output.push(next);
      remaining -= 1;
    }
  }
  return output;
}

export type PracticeBlock = { kind: VocabularyItemKind; label: string; count: number; startIndex: number };

/** Contiguous runs of the same kind, used for "Block 1: 5 collocations" UI. */
export function describeBlocks(items: readonly VocabularyItem[]): PracticeBlock[] {
  const blocks: PracticeBlock[] = [];
  items.forEach((item, index) => {
    const last = blocks[blocks.length - 1];
    if (last && last.kind === item.kind) last.count += 1;
    else blocks.push({ kind: item.kind, label: ITEM_KIND_LABELS[item.kind], count: 1, startIndex: index });
  });
  return blocks;
}

export function buildVocabularySession(items: readonly VocabularyItem[], limit?: number) {
  const ordered = interleaveItems(items);
  const selected = limit && limit > 0 ? ordered.slice(0, limit) : ordered;
  return { items: selected, blocks: describeBlocks(selected) };
}
