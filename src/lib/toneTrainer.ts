import { canonicalizePinyinDisplay, parsePinyinSyllables } from "./pinyin";

export function buildToneExercise(pronunciation: string | null | undefined) {
  const syllables = parsePinyinSyllables(pronunciation);
  if (!syllables) return { eligible: false as const, reason: "unparseable_pinyin" as const };
  return { eligible: true as const, canonical: canonicalizePinyinDisplay(pronunciation), syllables };
}

export function gradeToneSelection(pronunciation: string, selected: number[]) {
  const exercise = buildToneExercise(pronunciation);
  if (!exercise.eligible || selected.length !== exercise.syllables.length) return { correct: false, correctCount: 0, total: exercise.eligible ? exercise.syllables.length : 0, exercise };
  const correctCount = exercise.syllables.filter((syllable, index) => syllable.tone === selected[index]).length;
  return { correct: correctCount === exercise.syllables.length, correctCount, total: exercise.syllables.length, exercise };
}
