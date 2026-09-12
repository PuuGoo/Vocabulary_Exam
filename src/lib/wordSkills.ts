import type { MistakeReason } from "@/db/schema";

/**
 * A vocabulary item is not "known" just because its meaning is recognised.
 * Each learning dimension is tracked separately as behavioural evidence, while
 * `wordProgress.known` stays the learner's own self-rating. Smart Review reads
 * both: a self-rated known word with weak collocations still gets collocation
 * practice.
 */
export const WORD_SKILLS = {
  meaning_recognition: { label: "Nhận nghĩa", production: false },
  spelling_recognition: { label: "Nhận diện chính tả", production: false },
  spelling_production: { label: "Viết đúng chính tả", production: true },
  pronunciation_recall: { label: "Phát âm", production: true },
  listening_recognition: { label: "Nghe hiểu", production: false },
  collocation_usage: { label: "Collocation", production: true },
  pattern_usage: { label: "Cấu trúc", production: true },
  context_usage: { label: "Ngữ cảnh", production: true },
  paraphrase: { label: "Diễn đạt lại", production: true },
  speaking_usage: { label: "Dùng khi nói", production: true },
} as const;

export type WordSkill = keyof typeof WORD_SKILLS;
export const WORD_SKILL_LIST = Object.keys(WORD_SKILLS) as WordSkill[];

export function isWordSkill(value: unknown): value is WordSkill {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(WORD_SKILLS, value);
}

export function skillLabel(skill: WordSkill) {
  return WORD_SKILLS[skill].label;
}

/** Which existing (or new) mode produces evidence for a skill. */
export const MODE_SKILLS = {
  fill: "spelling_production",
  fill_unknown: "spelling_production",
  dictation: "spelling_production",
  mc: "meaning_recognition",
  match: "meaning_recognition",
  flashcard: "meaning_recognition",
  review_today: "meaning_recognition",
  listen: "listening_recognition",
  listen_choice: "listening_recognition",
  pronunciation: "pronunciation_recall",
  sentence: "context_usage",
  cloze: "context_usage",
  collocation: "collocation_usage",
  pattern: "pattern_usage",
  paraphrase: "paraphrase",
  speaking: "speaking_usage",
} as const satisfies Record<string, WordSkill>;

export type PracticeMode = keyof typeof MODE_SKILLS;

export function skillForMode(mode: string): WordSkill | null {
  return Object.prototype.hasOwnProperty.call(MODE_SKILLS, mode) ? MODE_SKILLS[mode as PracticeMode] : null;
}

/** Preferred modes for a skill, ordered from most active recall to recognition. */
export const SKILL_MODES: Record<WordSkill, readonly PracticeMode[]> = {
  meaning_recognition: ["fill", "mc"],
  spelling_recognition: ["fill"],
  spelling_production: ["fill", "dictation"],
  pronunciation_recall: ["pronunciation"],
  listening_recognition: ["dictation", "listen_choice"],
  collocation_usage: ["collocation"],
  pattern_usage: ["pattern"],
  context_usage: ["cloze", "sentence"],
  paraphrase: ["paraphrase"],
  speaking_usage: ["speaking"],
};

export const MISTAKE_REASON_FOR_SKILL: Record<WordSkill, MistakeReason> = {
  meaning_recognition: "wrong_meaning",
  spelling_recognition: "wrong_spelling",
  spelling_production: "wrong_spelling",
  pronunciation_recall: "wrong_pronunciation",
  listening_recognition: "wrong_meaning",
  collocation_usage: "wrong_collocation",
  pattern_usage: "wrong_pattern",
  context_usage: "wrong_context",
  paraphrase: "wrong_meaning",
  speaking_usage: "wrong_context",
};

export type SkillEvidence = {
  attempts: number;
  correctCount: number;
  assistedCount: number;
  streak: number;
};

export const EMPTY_SKILL_EVIDENCE: SkillEvidence = { attempts: 0, correctCount: 0, assistedCount: 0, streak: 0 };

/** Row-shaped input: database columns arrive nullable, evidence stays tolerant. */
export type SkillEvidenceInput = {
  attempts?: number | null;
  correctCount?: number | null;
  assistedCount?: number | null;
  streak?: number | null;
};

/** Below this many attempts the UI must say "chưa đủ dữ liệu" instead of a score. */
export const MIN_SKILL_EVIDENCE = 2;
export const WEAK_SKILL_MASTERY = 60;
export const STRONG_SKILL_MASTERY = 85;

const PRIOR_EFFECTIVE = 1;
const PRIOR_ATTEMPTS = 3;
const ASSIST_WEIGHT = 0.5;

/**
 * Bayesian-flavoured accuracy: the prior keeps a single lucky answer from
 * reporting 100% and a single slip from reporting 0%. Assisted answers count
 * half, so hints and pre-answer audio never inflate mastery.
 */
export function computeSkillMastery(evidence: SkillEvidenceInput | null | undefined): number | null {
  const attempts = Math.max(0, Math.trunc(evidence?.attempts ?? 0));
  if (attempts <= 0) return null;
  const correct = Math.min(attempts, Math.max(0, Math.trunc(evidence?.correctCount ?? 0)));
  const assisted = Math.min(attempts - correct, Math.max(0, Math.trunc(evidence?.assistedCount ?? 0)));
  const effective = correct + assisted * ASSIST_WEIGHT;
  return Math.round(((effective + PRIOR_EFFECTIVE) / (attempts + PRIOR_ATTEMPTS)) * 100);
}

export function applySkillOutcome(
  previous: SkillEvidenceInput | null | undefined,
  outcome: { correct: boolean; assisted?: boolean },
): SkillEvidence & { mastery: number | null } {
  const base: SkillEvidence = {
    attempts: Math.max(0, Math.trunc(previous?.attempts ?? 0)),
    correctCount: Math.max(0, Math.trunc(previous?.correctCount ?? 0)),
    assistedCount: Math.max(0, Math.trunc(previous?.assistedCount ?? 0)),
    streak: Math.max(0, Math.trunc(previous?.streak ?? 0)),
  };
  const assisted = Boolean(outcome.assisted);
  const next: SkillEvidence = {
    attempts: base.attempts + 1,
    correctCount: base.correctCount + (outcome.correct && !assisted ? 1 : 0),
    assistedCount: base.assistedCount + (outcome.correct && assisted ? 1 : 0),
    streak: outcome.correct ? base.streak + 1 : 0,
  };
  return { ...next, mastery: computeSkillMastery(next) };
}

export type SkillMastery = {
  skill: WordSkill;
  mastery: number | null;
  attempts: number;
  streak: number;
  /** False until there is enough evidence to show a number honestly. */
  sufficientEvidence: boolean;
};

export type SkillMasterySummary = {
  /** Mean mastery over skills with enough evidence; null when nothing is proven yet. */
  overall: number | null;
  bySkill: Partial<Record<WordSkill, SkillMastery>>;
  weakSkills: WordSkill[];
  unpracticedSkills: WordSkill[];
};

export function summarizeSkillMastery(
  rows: ReadonlyArray<{ skill: string; attempts: number; correctCount: number; assistedCount: number; streak?: number | null }>,
  available: readonly WordSkill[] = WORD_SKILL_LIST,
): SkillMasterySummary {
  const bySkill: Partial<Record<WordSkill, SkillMastery>> = {};
  for (const row of rows) {
    if (!isWordSkill(row.skill)) continue;
    const attempts = Math.max(0, row.attempts);
    const mastery = computeSkillMastery(row);
    bySkill[row.skill] = {
      skill: row.skill,
      mastery,
      attempts,
      streak: Math.max(0, row.streak ?? 0),
      sufficientEvidence: attempts >= MIN_SKILL_EVIDENCE,
    };
  }
  const scoped = available.filter((skill) => skill in bySkill).map((skill) => bySkill[skill]!);
  const proven = scoped.filter((item) => item.sufficientEvidence && item.mastery !== null);
  return {
    overall: proven.length ? Math.round(proven.reduce((sum, item) => sum + (item.mastery ?? 0), 0) / proven.length) : null,
    bySkill,
    weakSkills: proven.filter((item) => (item.mastery ?? 0) < WEAK_SKILL_MASTERY).map((item) => item.skill)
      .sort((left, right) => (bySkill[left]!.mastery ?? 0) - (bySkill[right]!.mastery ?? 0)),
    unpracticedSkills: available.filter((skill) => !(skill in bySkill)),
  };
}

export type SkillContentAvailability = {
  hasTerm: boolean;
  hasIpa: boolean;
  hasExample: boolean;
  hasCollocations: boolean;
  hasPatterns: boolean;
  hasCloze: boolean;
  hasParaphrase: boolean;
  hasChunks: boolean;
};

/**
 * A skill is only ever scheduled when the underlying content can support it.
 * Missing data means "not available", never "mastery 0".
 */
export function availableSkillsForContent(availability: Partial<SkillContentAvailability>): WordSkill[] {
  const skills: WordSkill[] = [];
  if (availability.hasTerm) skills.push("meaning_recognition", "spelling_production");
  if (availability.hasTerm && availability.hasIpa) skills.push("pronunciation_recall");
  if (availability.hasTerm) skills.push("listening_recognition");
  if (availability.hasCloze) skills.push("context_usage");
  if (availability.hasCollocations) skills.push("collocation_usage");
  if (availability.hasPatterns) skills.push("pattern_usage");
  if (availability.hasParaphrase) skills.push("paraphrase");
  if (availability.hasChunks) skills.push("speaking_usage");
  return skills;
}

export type SkillPriority = { skill: WordSkill; mastery: number | null; reason: "weak_skill" | "unpracticed" };

/**
 * Rank the skills worth practising next: proven-weak first (weakest on top),
 * then available skills that simply have no evidence yet. Skills without
 * supporting content are never suggested.
 */
export function rankSkillsForPractice(
  summary: Pick<SkillMasterySummary, "bySkill">,
  available: readonly WordSkill[],
): SkillPriority[] {
  const weak: SkillPriority[] = [];
  const unpracticed: SkillPriority[] = [];
  for (const skill of available) {
    const entry = summary.bySkill[skill];
    // No row yet, or too few attempts to trust: both mean "practise this more",
    // never "mastery 0".
    if (!entry || !entry.sufficientEvidence) {
      unpracticed.push({ skill, mastery: entry?.mastery ?? null, reason: "unpracticed" });
      continue;
    }
    if ((entry.mastery ?? 0) < WEAK_SKILL_MASTERY) weak.push({ skill, mastery: entry.mastery, reason: "weak_skill" });
  }
  weak.sort((left, right) => (left.mastery ?? 0) - (right.mastery ?? 0));
  return [...weak, ...unpracticed];
}
