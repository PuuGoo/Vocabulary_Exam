import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { categoryQuestions, vocabCategories, vocabSets, words, shareLinks } from "@/db/schema";
import { buildShareUrl, defaultShareModes, modesForSetType, QUESTION_SHARE_MODES, SHARE_TARGET_TYPES, SHARE_ACCESS_MODES, VOCAB_SHARE_MODES, type ShareAccessMode, type ShareTargetType, type ShareLearningMode } from "@/lib/shareConfig";
import { hashShareToken as hashToken } from "@/lib/shareToken";

export { buildShareUrl, defaultShareModes, modesForSetType, QUESTION_SHARE_MODES, SHARE_TARGET_TYPES, SHARE_ACCESS_MODES, VOCAB_SHARE_MODES } from "@/lib/shareConfig";
export { hashShareToken } from "@/lib/shareToken";
export type { ShareAccessMode, ShareTargetType, ShareLearningMode } from "@/lib/shareConfig";

function parseModes(value: string | null | undefined): string[] {
  try { const parsed = JSON.parse(value || "[]"); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; } catch { return []; }
}

export async function getShareByToken(token: string) {
  if (!token || token.length < 24 || token.length > 160) return null;
  const [share] = await db.select().from(shareLinks).where(eq(shareLinks.tokenHash, hashToken(token))).limit(1);
  if (!share || share.accessMode !== "anyone_with_link" || share.revokedAt || (share.expiresAt && share.expiresAt.getTime() <= Date.now())) return null;
  return { ...share, allowedModesList: parseModes(share.allowedModes) };
}

export async function getPublicSharePayload(token: string, requestedMode?: string) {
  const share = await getShareByToken(token);
  if (!share) return { share: null, error: "not_found" as const };
  if (requestedMode && !share.allowedModesList.includes(requestedMode)) return { share, error: "mode_not_allowed" as const };
  if (share.targetType === "vocab_set") {
    const [set] = await db.select({ id: vocabSets.id, name: vocabSets.name, type: vocabSets.type }).from(vocabSets).where(eq(vocabSets.id, share.targetId)).limit(1);
    if (!set) return { share, error: "target_missing" as const };
    const publicWords = await db.select({ id: words.id, meaning: words.meaning, term: words.term, example: words.example, wtype: words.wtype, ipa: words.ipa, v1: words.v1, v2: words.v2, v3: words.v3 }).from(words).where(eq(words.setId, set.id)).orderBy(words.id);
    return { share, payload: { targetType: share.targetType, title: set.name, count: publicWords.length, setType: set.type, allowedModes: share.allowedModesList, words: publicWords } };
  }
  const [category] = await db.select({ id: vocabCategories.id, name: vocabCategories.name }).from(vocabCategories).where(eq(vocabCategories.id, share.targetId)).limit(1);
  if (!category) return { share, error: "target_missing" as const };
  const questions = await db.select({ id: categoryQuestions.id, question: categoryQuestions.question, answer: categoryQuestions.answer, vnMeaning: categoryQuestions.vnMeaning, phonetic: categoryQuestions.phonetic, questionType: categoryQuestions.questionType, options: categoryQuestions.options, correctOption: categoryQuestions.correctOption, correctOptions: categoryQuestions.correctOptions, explanation: categoryQuestions.explanation }).from(categoryQuestions).where(eq(categoryQuestions.category, category.name)).orderBy(categoryQuestions.order, categoryQuestions.id);
  return { share, payload: { targetType: share.targetType, title: category.name, count: questions.length, allowedModes: share.allowedModesList, questions: questions.map((question) => ({ ...question, options: (() => { try { const parsed = JSON.parse(question.options || "[]"); return Array.isArray(parsed) ? parsed : []; } catch { return []; } })(), correctOptions: parseModes(question.correctOptions).length ? parseModes(question.correctOptions) : question.correctOption ? [question.correctOption] : [] })) } };
}

export async function getActiveShare(targetType: ShareTargetType, targetId: number) {
  const [share] = await db.select().from(shareLinks).where(and(eq(shareLinks.targetType, targetType), eq(shareLinks.targetId, targetId), eq(shareLinks.accessMode, "anyone_with_link"), isNull(shareLinks.revokedAt))).limit(1);
  return share ? { ...share, allowedModesList: parseModes(share.allowedModes) } : null;
}

export async function createOrUpdateShare(input: { targetType: ShareTargetType; targetId: number; createdByUserId: number; accessMode: ShareAccessMode; allowedModes: string[]; origin?: string }) {
  const modes = defaultShareModes(input.targetType).filter((mode) => input.allowedModes.includes(mode));
  const current = await getActiveShare(input.targetType, input.targetId);
  if (input.accessMode === "restricted") {
    if (current) await db.update(shareLinks).set({ accessMode: "restricted", updatedAt: new Date() }).where(eq(shareLinks.id, current.id));
    return { id: current?.id || null, token: null, url: null, accessMode: "restricted", allowedModes: modes };
  }
  if (current) {
    await db.update(shareLinks).set({ allowedModes: JSON.stringify(modes), updatedAt: new Date() }).where(eq(shareLinks.id, current.id));
    return { id: current.id, token: null, url: null, accessMode: "anyone_with_link", allowedModes: modes };
  }
  const token = randomBytes(32).toString("base64url");
  const [created] = await db.insert(shareLinks).values({ tokenHash: hashToken(token), targetType: input.targetType, targetId: input.targetId, createdByUserId: input.createdByUserId, accessMode: "anyone_with_link", allowedModes: JSON.stringify(modes) }).returning({ id: shareLinks.id });
  return { id: created.id, token, url: buildShareUrl(token, input.origin), accessMode: "anyone_with_link", allowedModes: modes };
}

export async function revokeShare(id: number) {
  await db.update(shareLinks).set({ accessMode: "restricted", revokedAt: new Date(), updatedAt: new Date() }).where(eq(shareLinks.id, id));
}
