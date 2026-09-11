export const LEARNING_SKILLS = [
  "meaning_recognition",
  "orthography_recognition",
  "orthography_production",
  "pronunciation_recall",
  "tone_accuracy",
  "listening_recognition",
  "speaking",
] as const;

export type LearningSkill = (typeof LEARNING_SKILLS)[number];
export type SkillResult = "correct" | "assisted" | "near_miss" | "incorrect";

export const LEARNING_SKILL_LABELS: Record<LearningSkill, string> = {
  meaning_recognition: "Nghĩa",
  orthography_recognition: "Nhận diện chữ",
  orthography_production: "Chữ Hán",
  pronunciation_recall: "Pinyin",
  tone_accuracy: "Thanh điệu",
  listening_recognition: "Nghe",
  speaking: "Nói",
};

export const SKILL_RECOMMENDED_MODE: Record<LearningSkill, string> = {
  meaning_recognition: "mc",
  orthography_recognition: "mc",
  orthography_production: "fill",
  pronunciation_recall: "fill-pronunciation",
  tone_accuracy: "tone",
  listening_recognition: "dictation",
  speaking: "pronunciation",
};

export function isLearningSkill(value: unknown): value is LearningSkill {
  return typeof value === "string" && (LEARNING_SKILLS as readonly string[]).includes(value);
}

export function resultQuality(result: SkillResult) {
  return result === "correct" ? 100 : result === "assisted" ? 70 : result === "near_miss" ? 50 : 0;
}

export function nextMasteryScore(previous: number | null | undefined, quality: number) {
  const bounded = Math.max(0, Math.min(100, Math.round(quality)));
  if (previous == null) return bounded;
  return Math.max(0, Math.min(100, Math.round(previous * 0.8 + bounded * 0.2)));
}

export type MasteryLabel = "Chưa đủ dữ liệu" | "Yếu" | "Đang học" | "Khá" | "Vững";
export function masteryLabel(score: number | null | undefined, practiceCount = 0): MasteryLabel {
  if (score == null || practiceCount === 0) return "Chưa đủ dữ liệu";
  if (score >= 85 && practiceCount >= 3) return "Vững";
  if (score >= 70) return "Khá";
  if (score >= 40) return "Đang học";
  return "Yếu";
}

export function skillForMode(mode: string, options?: { target?: "term" | "pronunciation"; direction?: string }): LearningSkill | null {
  if (mode === "fill" || mode === "cloze") return options?.target === "pronunciation" ? "pronunciation_recall" : "orthography_production";
  if (mode === "tone") return "tone_accuracy";
  if (mode === "dictation") return "listening_recognition";
  if (mode === "pronunciation") return "speaking";
  if (mode === "mc") return options?.direction === "meaning_to_target" ? "orthography_recognition" : "meaning_recognition";
  return null;
}
