import {
  buildClozeItem, buildCollocationItems, buildPatternItems,
  type CollocationContent, type PatternContent, type PracticeWord,
} from "@/lib/vocabularyPractice";
import { availableSkillsForContent, type WordSkill } from "@/lib/wordSkills";

/**
 * Single source of truth for "which modes can this word actually be practised
 * in right now". A mode is only offered when the underlying authored content can
 * produce a gradeable item, so Smart Review and the study UI never link to an
 * empty exercise.
 */

export type AvailabilityWord = PracticeWord & { setType?: string | null; ipaV1?: string | null };
export type AvailabilityContent = {
  collocations?: readonly CollocationContent[];
  patterns?: readonly PatternContent[];
};

export const CORE_MODES = ["learn", "fill", "match", "dictation", "listen", "pronunciation"] as const;
export const DEPTH_MODES = ["collocation", "pattern", "cloze"] as const;

export function hasCollocationPractice(word: AvailabilityWord, content: AvailabilityContent) {
  return buildCollocationItems(word, content.collocations || []).length > 0;
}

export function hasPatternPractice(word: AvailabilityWord, content: AvailabilityContent) {
  return buildPatternItems(word, content.patterns || []).length > 0;
}

export function hasClozePractice(word: AvailabilityWord) {
  return buildClozeItem(word) !== null;
}

export function availableModesForWord(word: AvailabilityWord, content: AvailabilityContent = {}): string[] {
  const isVerb = word.setType === "irregular_verb";
  const hasTerm = Boolean((word.term || "").trim());
  const hasIpa = Boolean((word.ipa || "").trim());
  const modes: string[] = ["learn"];

  if (isVerb) {
    modes.push("fill", "match", "dictation");
    if (hasIpa || word.ipaV1) modes.push("pronunciation");
    return modes;
  }

  if (hasTerm) modes.push("fill", "mc", "match", "dictation", "listen", "sentence");
  if (hasTerm && hasIpa) modes.push("pronunciation");
  if (hasCollocationPractice(word, content)) modes.push("collocation");
  if (hasPatternPractice(word, content)) modes.push("pattern");
  if (hasClozePractice(word)) modes.push("cloze");
  return modes;
}

export function availableSkillsForWord(word: AvailabilityWord, content: AvailabilityContent = {}): WordSkill[] {
  return availableSkillsForContent({
    hasTerm: Boolean((word.term || "").trim()),
    hasIpa: Boolean((word.ipa || "").trim()),
    hasCollocations: hasCollocationPractice(word, content),
    hasPatterns: hasPatternPractice(word, content),
    hasCloze: hasClozePractice(word),
  });
}
