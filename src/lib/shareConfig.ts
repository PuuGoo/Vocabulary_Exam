export const SHARE_TARGET_TYPES = ["vocab_set", "question_collection"] as const;
export type ShareTargetType = (typeof SHARE_TARGET_TYPES)[number];
export const SHARE_ACCESS_MODES = ["restricted", "anyone_with_link"] as const;
export type ShareAccessMode = (typeof SHARE_ACCESS_MODES)[number];
export const VOCAB_SHARE_MODES = ["learn", "fill", "mc", "match", "dictation", "pronunciation", "sentence", "timed"] as const;
export const QUESTION_SHARE_MODES = ["practice", "multiple_choice", "speaking", "shuffle"] as const;
export type ShareLearningMode = (typeof VOCAB_SHARE_MODES)[number] | (typeof QUESTION_SHARE_MODES)[number];
export const SHARE_CONTENT_KEYS = ["vocab", "quiz", "essay", "speaking", "documents"] as const;
export type ShareContentKey = (typeof SHARE_CONTENT_KEYS)[number];

export function buildShareUrl(token: string, origin?: string) {
  const base = origin || process.env.NEXT_PUBLIC_APP_URL || "";
  return `${base.replace(/\/$/, "")}/s/${encodeURIComponent(token)}`;
}

export function modesForSetType(type: string): readonly string[] {
  return type === "irregular_verb" ? ["learn", "fill", "mc", "match", "dictation", "timed"] : VOCAB_SHARE_MODES;
}

export function defaultShareModes(targetType: ShareTargetType, setType?: string) {
  return [...(targetType === "vocab_set" ? modesForSetType(setType || "ielts_vocab") : QUESTION_SHARE_MODES)];
}
