import { randomBytes } from "node:crypto";
import { and, eq, inArray, isNull, like, or } from "drizzle-orm";
import { db } from "@/db";
import { categoryDocuments, categoryQuestions, vocabCategories, vocabSets, words, shareLinks } from "@/db/schema";
import { buildShareUrl, defaultShareModes, modesForSetType, QUESTION_SHARE_MODES, SHARE_CONTENT_KEYS, SHARE_TARGET_TYPES, SHARE_ACCESS_MODES, VOCAB_SHARE_MODES, type ShareAccessMode, type ShareContentKey, type ShareTargetType, type ShareLearningMode } from "@/lib/shareConfig";
import { questionCollectionForType, questionTypesForCollections } from "@/lib/questionCollections";
import { hashShareToken as hashToken } from "@/lib/shareToken";

export { buildShareUrl, defaultShareModes, modesForSetType, QUESTION_SHARE_MODES, SHARE_TARGET_TYPES, SHARE_ACCESS_MODES, VOCAB_SHARE_MODES } from "@/lib/shareConfig";
export { hashShareToken } from "@/lib/shareToken";
export type { ShareAccessMode, ShareTargetType, ShareLearningMode } from "@/lib/shareConfig";

function parseModes(value: string | null | undefined): string[] {
  try { const parsed = JSON.parse(value || "[]"); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; } catch { return []; }
}

function parseContentSelection(value: string | null | undefined): ShareContentKey[] {
  const parsed = parseModes(value);
  return SHARE_CONTENT_KEYS.filter((key) => parsed.includes(key));
}

type ContentSnapshot = { setIds: number[]; questionIds: number[]; documentIds: number[] };
function parseContentSnapshot(value: string | null | undefined): ContentSnapshot {
  try {
    const parsed = JSON.parse(value || "{}");
    const ids = (items: unknown) => Array.isArray(items) ? items.filter((item): item is number => Number.isInteger(item) && item > 0) : [];
    return { setIds: ids(parsed.setIds), questionIds: ids(parsed.questionIds), documentIds: ids(parsed.documentIds) };
  } catch { return { setIds: [], questionIds: [], documentIds: [] }; }
}

export async function getCategoryShareContent(targetId: number) {
  const [category] = await db.select({ id: vocabCategories.id, name: vocabCategories.name }).from(vocabCategories).where(eq(vocabCategories.id, targetId)).limit(1);
  if (!category) return null;
  const inCategoryTree = (column: typeof vocabSets.category | typeof categoryQuestions.category | typeof categoryDocuments.category) => or(eq(column, category.name), like(column, `${category.name} / %`));
  const [sets, questions, documents] = await Promise.all([
    db.select({ id: vocabSets.id, name: vocabSets.name }).from(vocabSets).where(inCategoryTree(vocabSets.category)),
    db.select({ id: categoryQuestions.id, questionType: categoryQuestions.questionType }).from(categoryQuestions).where(inCategoryTree(categoryQuestions.category)),
    db.select({ id: categoryDocuments.id, title: categoryDocuments.title, fileName: categoryDocuments.fileName }).from(categoryDocuments).where(inCategoryTree(categoryDocuments.category)),
  ]);
  const counts = { quiz: 0, essay: 0, speaking: 0 };
  for (const question of questions) { const key = questionCollectionForType(question.questionType); if (key) counts[key] += 1; }
  return { category, sets, documents, questions, counts };
}

export async function getShareByToken(token: string) {
  if (!token || token.length < 24 || token.length > 160) return null;
  const [share] = await db.select().from(shareLinks).where(eq(shareLinks.tokenHash, hashToken(token))).limit(1);
  if (!share || share.accessMode !== "anyone_with_link" || share.revokedAt || (share.expiresAt && share.expiresAt.getTime() <= Date.now())) return null;
  return { ...share, allowedModesList: parseModes(share.allowedModes), contentSelectionList: parseContentSelection(share.contentSelection), contentSnapshotValue: parseContentSnapshot(share.contentSnapshot) };
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
  const selectedTypes = questionTypesForCollections(share.contentSelectionList);
  const questionScope = share.includeNewContent
    ? and(or(eq(categoryQuestions.category, category.name), like(categoryQuestions.category, `${category.name} / %`)), inArray(categoryQuestions.questionType, selectedTypes))
    : share.contentSnapshotValue.questionIds.length ? inArray(categoryQuestions.id, share.contentSnapshotValue.questionIds) : null;
  const questions = selectedTypes.length && questionScope ? await db.select({ id: categoryQuestions.id, question: categoryQuestions.question, answer: categoryQuestions.answer, vnMeaning: categoryQuestions.vnMeaning, phonetic: categoryQuestions.phonetic, questionType: categoryQuestions.questionType, options: categoryQuestions.options, correctOption: categoryQuestions.correctOption, correctOptions: categoryQuestions.correctOptions, explanation: categoryQuestions.explanation }).from(categoryQuestions).where(questionScope).orderBy(categoryQuestions.order, categoryQuestions.id) : [];
  return { share, payload: { targetType: share.targetType, title: category.name, count: questions.length, allowedModes: share.allowedModesList, questions: questions.map((question) => ({ ...question, options: (() => { try { const parsed = JSON.parse(question.options || "[]"); return Array.isArray(parsed) ? parsed : []; } catch { return []; } })(), correctOptions: parseModes(question.correctOptions).length ? parseModes(question.correctOptions) : question.correctOption ? [question.correctOption] : [] })) } };
}

export async function getActiveShare(targetType: ShareTargetType, targetId: number) {
  const [share] = await db.select().from(shareLinks).where(and(eq(shareLinks.targetType, targetType), eq(shareLinks.targetId, targetId), eq(shareLinks.accessMode, "anyone_with_link"), isNull(shareLinks.revokedAt))).limit(1);
  return share ? { ...share, allowedModesList: parseModes(share.allowedModes), contentSelectionList: parseContentSelection(share.contentSelection), contentSnapshotValue: parseContentSnapshot(share.contentSnapshot) } : null;
}

export async function createOrUpdateShare(input: { targetType: ShareTargetType; targetId: number; createdByUserId: number; accessMode: ShareAccessMode; allowedModes: string[]; contentSelection?: string[]; includeNewContent?: boolean; origin?: string }) {
  const modes = defaultShareModes(input.targetType).filter((mode) => input.allowedModes.includes(mode));
  const contentSelection = SHARE_CONTENT_KEYS.filter((key) => (input.contentSelection || SHARE_CONTENT_KEYS).includes(key));
  const includeNewContent = input.includeNewContent ?? true;
  let contentSnapshot: ContentSnapshot = { setIds: [], questionIds: [], documentIds: [] };
  if (input.targetType === "question_collection" && !includeNewContent) {
    const content = await getCategoryShareContent(input.targetId);
    if (content) contentSnapshot = {
      setIds: contentSelection.includes("vocab") ? content.sets.map((item) => item.id) : [],
      questionIds: content.questions.filter((item) => { const key = questionCollectionForType(item.questionType); return key ? contentSelection.includes(key) : false; }).map((item) => item.id),
      documentIds: contentSelection.includes("documents") ? content.documents.map((item) => item.id) : [],
    };
  }
  const current = await getActiveShare(input.targetType, input.targetId);
  if (input.accessMode === "restricted") {
    if (current) await db.update(shareLinks).set({ accessMode: "restricted", updatedAt: new Date() }).where(eq(shareLinks.id, current.id));
    return { id: current?.id || null, token: null, url: null, accessMode: "restricted", allowedModes: modes };
  }
  if (current) {
    await db.update(shareLinks).set({ allowedModes: JSON.stringify(modes), contentSelection: JSON.stringify(contentSelection), includeNewContent, contentSnapshot: JSON.stringify(contentSnapshot), updatedAt: new Date() }).where(eq(shareLinks.id, current.id));
    return { id: current.id, token: null, url: null, accessMode: "anyone_with_link", allowedModes: modes };
  }
  const token = randomBytes(32).toString("base64url");
  const [created] = await db.insert(shareLinks).values({ tokenHash: hashToken(token), targetType: input.targetType, targetId: input.targetId, createdByUserId: input.createdByUserId, accessMode: "anyone_with_link", allowedModes: JSON.stringify(modes), contentSelection: JSON.stringify(contentSelection), includeNewContent, contentSnapshot: JSON.stringify(contentSnapshot) }).returning({ id: shareLinks.id });
  return { id: created.id, token, url: buildShareUrl(token, input.origin), accessMode: "anyone_with_link", allowedModes: modes };
}

export async function revokeShare(id: number) {
  await db.update(shareLinks).set({ accessMode: "restricted", revokedAt: new Date(), updatedAt: new Date() }).where(eq(shareLinks.id, id));
}
