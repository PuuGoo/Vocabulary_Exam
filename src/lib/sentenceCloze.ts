import { getChineseSettings } from "./languageSettings";

type ClozeWord = { term?: string | null; alternateTerm?: string | null; example?: string | null; examplePronunciation?: string | null; exampleMeaning?: string | null };
type ClozeSet = { languageCode?: string | null; languageSettings?: unknown };

export function buildSentenceCloze({ word, set }: { word: ClozeWord; set: ClozeSet }) {
  if (set.languageCode !== "zh-CN" || !word.example) return { eligible: false as const, reason: "missing_example" as const };
  const settings = getChineseSettings(set);
  const candidates = settings.scriptVariant === "traditional"
    ? [word.alternateTerm, word.term]
    : [word.term, ...(settings.scriptVariant === "both" ? [word.alternateTerm] : [])];
  for (const candidate of candidates.filter((value): value is string => Boolean(value))) {
    const first = word.example.indexOf(candidate);
    if (first < 0 || word.example.indexOf(candidate, first + candidate.length) >= 0) continue;
    return {
      eligible: true as const,
      prompt: `${word.example.slice(0, first)}____${word.example.slice(first + candidate.length)}`,
      answer: candidate,
      fullSentence: word.example,
      examplePronunciation: word.examplePronunciation || "",
      exampleMeaning: word.exampleMeaning || "",
    };
  }
  return { eligible: false as const, reason: "target_not_unique" as const };
}
