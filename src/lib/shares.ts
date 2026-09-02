import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, isNull, like, or } from "drizzle-orm";
import { db } from "@/db";
import { categoryDocuments, categoryQuestions, vocabCategories, vocabSets, words, shareLinks } from "@/db/schema";
import { buildShareUrl, defaultShareModes, getPublicShareUrl, modesForSetType, QUESTION_SHARE_MODES, SHARE_CONTENT_KEYS, SHARE_TARGET_TYPES, SHARE_ACCESS_MODES, VOCAB_SHARE_MODES, type ShareAccessMode, type ShareContentKey, type ShareTargetType, type ShareLearningMode } from "@/lib/shareConfig";
import { questionCollectionForType, questionTypesForCollections } from "@/lib/questionCollections";
import { hashShareToken as hashToken } from "@/lib/shareToken";
import { normalizeShareSlug, validateShareSlug } from "@/lib/shareSlug";

export { buildShareUrl, defaultShareModes, getPublicShareUrl, modesForSetType, QUESTION_SHARE_MODES, SHARE_TARGET_TYPES, SHARE_ACCESS_MODES, VOCAB_SHARE_MODES } from "@/lib/shareConfig";
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

function hydrateShare<T extends typeof shareLinks.$inferSelect>(share: T) {
  return { ...share, allowedModesList: parseModes(share.allowedModes), contentSelectionList: parseContentSelection(share.contentSelection), contentSnapshotValue: parseContentSnapshot(share.contentSnapshot) };
}

export async function getShareByIdentifier(identifier: string) {
  if (!identifier || identifier.length > 160) return null;
  const normalizedSlug = normalizeShareSlug(identifier);
  const slugCandidate = normalizedSlug === identifier.toLowerCase() && normalizedSlug.length >= 4;
  const [slugShare] = slugCandidate ? await db.select().from(shareLinks).where(eq(shareLinks.customSlug, normalizedSlug)).limit(1) : [];
  const [tokenShare] = !slugShare && identifier.length >= 24 ? await db.select().from(shareLinks).where(eq(shareLinks.tokenHash, hashToken(identifier))).limit(1) : [];
  const share = slugShare || tokenShare;
  if (!share || share.accessMode !== "anyone_with_link" || share.revokedAt || (share.expiresAt && share.expiresAt.getTime() <= Date.now())) return null;
  return hydrateShare(share);
}

export const getShareByToken = getShareByIdentifier;

export async function getPublicSharePayload(token: string, requestedMode?: string, requestedSetId?: number, requestedCollection?: string) {
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
  const categoryContent = await getCategoryShareContent(share.targetId);
  if (!categoryContent) return { share, error: "target_missing" as const };
  const allowedSets = share.contentSelectionList.includes("vocab") ? categoryContent.sets.filter((item) => share.includeNewContent || share.contentSnapshotValue.setIds.includes(item.id)) : [];
  const allowedDocuments = share.contentSelectionList.includes("documents") ? categoryContent.documents.filter((item) => share.includeNewContent || share.contentSnapshotValue.documentIds.includes(item.id)) : [];
  const selectedTypes = questionTypesForCollections(share.contentSelectionList);
  const activeQuestionMeta = categoryContent.questions.filter((item) => selectedTypes.includes(item.questionType) && (share.includeNewContent || share.contentSnapshotValue.questionIds.includes(item.id)));
  const collectionKeys = ["quiz", "essay", "speaking"].filter((key) => share.contentSelectionList.includes(key as ShareContentKey));
  if (!requestedMode && !requestedSetId && !requestedCollection) {
    const collections = collectionKeys.map((key) => ({ key, count: activeQuestionMeta.filter((item) => questionCollectionForType(item.questionType) === key).length })).filter((item) => item.count > 0);
    return { share, payload: { targetType: "category_hub", title: category.name, count: allowedSets.length + activeQuestionMeta.length + allowedDocuments.length, allowedModes: share.allowedModesList, sets: allowedSets, documents: allowedDocuments, collections } };
  }
  if (requestedSetId) {
    const selectedSet = allowedSets.find((item) => item.id === requestedSetId);
    if (!selectedSet) return { share, error: "target_missing" as const };
    const [set] = await db.select({ id: vocabSets.id, name: vocabSets.name, type: vocabSets.type }).from(vocabSets).where(eq(vocabSets.id, selectedSet.id)).limit(1);
    if (!set) return { share, error: "target_missing" as const };
    const publicWords = await db.select({ id: words.id, meaning: words.meaning, term: words.term, example: words.example, wtype: words.wtype, ipa: words.ipa, v1: words.v1, v2: words.v2, v3: words.v3 }).from(words).where(eq(words.setId, set.id)).orderBy(words.id);
    return { share, payload: { targetType: "vocab_set", title: set.name, count: publicWords.length, setType: set.type, allowedModes: share.allowedModesList.filter((mode) => modesForSetType(set.type).includes(mode)), words: publicWords } };
  }
  const requestedTypes = requestedCollection && collectionKeys.includes(requestedCollection) ? questionTypesForCollections([requestedCollection]) : selectedTypes;
  const questionScope = share.includeNewContent
    ? and(or(eq(categoryQuestions.category, category.name), like(categoryQuestions.category, `${category.name} / %`)), inArray(categoryQuestions.questionType, requestedTypes))
    : share.contentSnapshotValue.questionIds.length ? and(inArray(categoryQuestions.id, share.contentSnapshotValue.questionIds), inArray(categoryQuestions.questionType, requestedTypes)) : null;
  const questions = requestedTypes.length && questionScope ? await db.select({ id: categoryQuestions.id, question: categoryQuestions.question, answer: categoryQuestions.answer, vnMeaning: categoryQuestions.vnMeaning, phonetic: categoryQuestions.phonetic, questionType: categoryQuestions.questionType, options: categoryQuestions.options, correctOption: categoryQuestions.correctOption, correctOptions: categoryQuestions.correctOptions, explanation: categoryQuestions.explanation }).from(categoryQuestions).where(questionScope).orderBy(categoryQuestions.order, categoryQuestions.id) : [];
  return { share, payload: { targetType: share.targetType, title: category.name, count: questions.length, allowedModes: share.allowedModesList, questions: questions.map((question) => ({ ...question, options: (() => { try { const parsed = JSON.parse(question.options || "[]"); return Array.isArray(parsed) ? parsed : []; } catch { return []; } })(), correctOptions: parseModes(question.correctOptions).length ? parseModes(question.correctOptions) : question.correctOption ? [question.correctOption] : [] })) } };
}

export async function getActiveShare(targetType: ShareTargetType, targetId: number) {
  const [share] = await db.select().from(shareLinks).where(and(eq(shareLinks.targetType, targetType), eq(shareLinks.targetId, targetId), eq(shareLinks.accessMode, "anyone_with_link"), isNull(shareLinks.revokedAt))).limit(1);
  return share ? hydrateShare(share) : null;
}

export async function getManagedShare(targetType: ShareTargetType, targetId: number) {
  const [share] = await db.select().from(shareLinks).where(and(eq(shareLinks.targetType, targetType), eq(shareLinks.targetId, targetId), isNull(shareLinks.revokedAt))).orderBy(desc(shareLinks.id)).limit(1);
  return share ? hydrateShare(share) : null;
}

export async function isShareSlugAvailable(slug: string, currentShareId?: number | null) {
  const normalized = normalizeShareSlug(slug);
  const [existing] = await db.select({ id: shareLinks.id }).from(shareLinks).where(eq(shareLinks.customSlug, normalized)).limit(1);
  return !existing || existing.id === currentShareId;
}

export function isShareSlugConflict(error: unknown) {
  const candidate = error as { code?: string; constraint_name?: string; constraint?: string } | null;
  return candidate?.code === "23505" && (candidate.constraint_name === "share_links_custom_slug_idx" || candidate.constraint === "share_links_custom_slug_idx");
}

export async function createOrUpdateShare(input: { targetType: ShareTargetType; targetId: number; createdByUserId: number; accessMode: ShareAccessMode; allowedModes: string[]; contentSelection?: string[]; includeNewContent?: boolean; customSlug?: string | null; origin?: string }) {
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
  const current = await getManagedShare(input.targetType, input.targetId);
  let customSlug = current?.customSlug || null;
  if (input.customSlug !== undefined) {
    if (input.customSlug === null || !input.customSlug.trim()) customSlug = null;
    else {
      const validation = validateShareSlug(input.customSlug);
      if (!validation.valid) throw Object.assign(new Error("INVALID_SHARE_SLUG"), { code: "INVALID_SHARE_SLUG", reason: validation.reason });
      customSlug = validation.slug;
      if (!await isShareSlugAvailable(customSlug, current?.id)) throw Object.assign(new Error("SHARE_SLUG_TAKEN"), { code: "SHARE_SLUG_TAKEN" });
    }
  }
  if (input.accessMode === "restricted") {
    if (current) await db.update(shareLinks).set({ accessMode: "restricted", customSlug, updatedAt: new Date() }).where(eq(shareLinks.id, current.id));
    return { id: current?.id || null, token: null, secureUrl: null, publicUrl: null, customSlug, accessMode: "restricted", allowedModes: modes };
  }
  if (current) {
    await db.update(shareLinks).set({ accessMode: "anyone_with_link", customSlug, allowedModes: JSON.stringify(modes), contentSelection: JSON.stringify(contentSelection), includeNewContent, contentSnapshot: JSON.stringify(contentSnapshot), updatedAt: new Date() }).where(eq(shareLinks.id, current.id));
    return { id: current.id, token: null, secureUrl: null, publicUrl: getPublicShareUrl({ customSlug }, input.origin), customSlug, accessMode: "anyone_with_link", allowedModes: modes };
  }
  const token = randomBytes(32).toString("base64url");
  const [created] = await db.insert(shareLinks).values({ tokenHash: hashToken(token), customSlug, targetType: input.targetType, targetId: input.targetId, createdByUserId: input.createdByUserId, accessMode: "anyone_with_link", allowedModes: JSON.stringify(modes), contentSelection: JSON.stringify(contentSelection), includeNewContent, contentSnapshot: JSON.stringify(contentSnapshot) }).returning({ id: shareLinks.id });
  const secureUrl = getPublicShareUrl({ rawToken: token }, input.origin);
  return { id: created.id, token, secureUrl, publicUrl: getPublicShareUrl({ customSlug, rawToken: token }, input.origin), customSlug, accessMode: "anyone_with_link", allowedModes: modes };
}

export async function revokeShare(id: number) {
  await db.update(shareLinks).set({ accessMode: "restricted", revokedAt: new Date(), updatedAt: new Date() }).where(eq(shareLinks.id, id));
}
