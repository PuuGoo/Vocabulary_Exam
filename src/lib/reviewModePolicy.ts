import {
  SKILL_MODES, STRONG_SKILL_MASTERY, WEAK_SKILL_MASTERY, skillLabel,
  type PracticeMode, type SkillPriority, type WordSkill,
} from "@/lib/wordSkills";

/**
 * Smart Review keeps its existing spaced-repetition scheduling. This module only
 * answers two extra questions per candidate: *why* is it due, and *which
 * learning dimension* should the session actually practise.
 */

export type ReviewReasonCode =
  | "overdue" | "due" | "difficult" | "forgotten"
  | "weak_skill" | "unpracticed" | "set_review" | "stale";

export const REVIEW_REASON_LABELS: Record<ReviewReasonCode, string> = {
  overdue: "Đã quá hạn ôn",
  due: "Đã đến hạn ôn",
  difficult: "Bạn đã sai nhiều lần",
  forgotten: "Bạn đánh dấu chưa nhớ",
  weak_skill: "Kỹ năng còn yếu",
  unpracticed: "Chưa luyện kỹ năng này",
  set_review: "Đến checkpoint ôn bộ",
  stale: "Lâu rồi chưa xem lại",
};

/** Reason precedence keeps the existing scheduling semantics visible to learners. */
const REASON_ORDER: ReviewReasonCode[] = [
  "overdue", "difficult", "forgotten", "weak_skill", "unpracticed", "set_review", "due", "stale",
];

export type ReviewRecommendation = {
  mode: PracticeMode | null;
  skill: WordSkill | null;
  reason: ReviewReasonCode;
  /** Ready-to-show explanation, e.g. "Collocation còn yếu". */
  label: string;
};

export function dominantReason(reasons: readonly ReviewReasonCode[]): ReviewReasonCode {
  for (const reason of REASON_ORDER) if (reasons.includes(reason)) return reason;
  return reasons[0] || "due";
}

/**
 * §42 difficulty adaptation: the same word escalates from recognition to
 * production as its evidence grows, without exposing the levels in the UI.
 */
export function modeForSkillMastery(skill: WordSkill, mastery: number | null, available: readonly string[]): PracticeMode | null {
  const candidates = SKILL_MODES[skill].filter((mode) => available.includes(mode));
  if (!candidates.length) return null;
  if (mastery === null || mastery < WEAK_SKILL_MASTERY) {
    const recognition = candidates.find((mode) => mode === "mc" || mode === "listen_choice");
    // No evidence yet or proven weak: start from recognition, then escalate.
    if (recognition) return recognition;
  }
  if (mastery !== null && mastery >= STRONG_SKILL_MASTERY) {
    const production = candidates.find((mode) => mode !== "mc" && mode !== "listen_choice");
    if (production) return production;
  }
  return candidates[0];
}

export function recommendReviewMode(input: {
  reasons: readonly ReviewReasonCode[];
  skillPriorities?: readonly SkillPriority[];
  availableModes?: readonly string[];
  fallbackMode?: PracticeMode;
}): ReviewRecommendation {
  const available = input.availableModes ?? [];
  const skillPriorities = input.skillPriorities ?? [];
  const reasons: ReviewReasonCode[] = [...input.reasons];
  const next = skillPriorities.find((priority) => modeForSkillMastery(priority.skill, priority.mastery, available));
  if (next && !reasons.includes(next.reason)) reasons.push(next.reason);

  const reason = dominantReason(reasons);
  const chosen = next ? modeForSkillMastery(next.skill, next.mastery, available) : null;
  const mode = chosen ?? input.fallbackMode ?? null;
  const skill = chosen ? next!.skill : mode ? skillForRecommendedMode(mode) : null;
  return { mode, skill, reason, label: describeReason(reason, skill) };
}

function skillForRecommendedMode(mode: PracticeMode): WordSkill | null {
  const entry = Object.entries(SKILL_MODES).find(([, modes]) => (modes as readonly string[]).includes(mode));
  return (entry?.[0] as WordSkill | undefined) ?? null;
}

export function describeReason(reason: ReviewReasonCode, skill: WordSkill | null): string {
  if ((reason === "weak_skill" || reason === "unpracticed") && skill) {
    return reason === "weak_skill" ? `${skillLabel(skill)} còn yếu` : `Chưa luyện ${skillLabel(skill)}`;
  }
  return REVIEW_REASON_LABELS[reason];
}

/**
 * §40: inside one session, never ask the same dimension more than `maxRun`
 * times in a row. Reorders by swapping with the next different mode, keeping
 * the overall priority order intact.
 */
export function limitConsecutiveModes<T extends { mode: string | null }>(items: readonly T[], maxRun = 2): T[] {
  const result: T[] = [];
  const pending = [...items];
  while (pending.length) {
    const runMode = result.length ? result[result.length - 1].mode : null;
    const runLength = countTrailingRun(result, runMode);
    let index = 0;
    if (runLength >= maxRun) {
      index = pending.findIndex((item) => item.mode !== runMode);
      if (index < 0) index = 0;
    }
    result.push(pending.splice(index, 1)[0]);
  }
  return result;
}

function countTrailingRun<T extends { mode: string | null }>(items: readonly T[], mode: string | null) {
  let count = 0;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index].mode !== mode) break;
    count += 1;
  }
  return count;
}

const MODE_HREFS: Record<string, (setId: number) => string> = {
  learn: (setId) => `/learn/${setId}`,
  fill: (setId) => `/quiz/${setId}?mode=fill`,
  mc: (setId) => `/quiz/${setId}?mode=mc`,
  match: (setId) => `/match/${setId}`,
  dictation: (setId) => `/dictation/${setId}`,
  listen: (setId) => `/listen/${setId}`,
  listen_choice: (setId) => `/listen/${setId}?task=choice`,
  pronunciation: (setId) => `/pronunciation/${setId}`,
  sentence: (setId) => `/sentence/${setId}`,
  collocation: (setId) => `/collocation/${setId}`,
  cloze: (setId) => `/cloze/${setId}`,
  pattern: (setId) => `/pattern/${setId}`,
};

export function reviewModeHref(mode: string | null, setId: number): string | null {
  if (!mode) return null;
  const build = MODE_HREFS[mode];
  return build ? build(setId) : null;
}
