import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  topics, wordCollocations, wordFamilyMembers, wordFamilies, wordPatterns, wordPronunciations, wordSkillProgress,
  wordTopics, words,
} from "@/db/schema";
import { isPublishedStatus } from "@/lib/vocabularyMeta";

/**
 * Batch loaders for the vocabulary-depth entities. Everything is keyed by
 * `wordId` and always loaded in one query per entity type — never one query
 * per word — so a 40-word review session stays bounded.
 */

export type CollocationRow = {
  id: number; wordId: number; phrase: string; meaning: string | null;
  example: string | null; register: string | null; contentStatus: string; position: number;
};

export type PatternRow = {
  id: number; wordId: number; pattern: string; meaning: string | null;
  example: string | null; contentStatus: string; position: number;
};

export type PronunciationRow = {
  id: number; wordId: number; ipa: string; partOfSpeech: string | null;
  sense: string | null; locale: string; isPrimary: boolean; position: number;
};

export type FamilyMemberRow = { wordId: number; term: string | null; meaning: string; relation: string | null };

export type WordContent = {
  collocations: CollocationRow[];
  patterns: PatternRow[];
  topics: string[];
  pronunciations: PronunciationRow[];
  families: Array<{ id: number; label: string; members: FamilyMemberRow[] }>;
};

export const EMPTY_WORD_CONTENT: WordContent = {
  collocations: [], patterns: [], topics: [], pronunciations: [], families: [],
};

function groupBy<T>(rows: readonly T[], key: (row: T) => number) {
  const grouped = new Map<number, T[]>();
  for (const row of rows) {
    const id = key(row);
    grouped.set(id, [...(grouped.get(id) || []), row]);
  }
  return grouped;
}

export type LoadWordContentOptions = { includeUnpublished?: boolean };

export async function loadCollocationsByWordId(
  wordIds: readonly number[],
  options: LoadWordContentOptions = {},
): Promise<Map<number, CollocationRow[]>> {
  if (!wordIds.length) return new Map();
  const rows = await db.select().from(wordCollocations)
    .where(inArray(wordCollocations.wordId, [...wordIds]))
    .orderBy(wordCollocations.wordId, wordCollocations.position, wordCollocations.id);
  const visible = options.includeUnpublished ? rows : rows.filter((row) => isPublishedStatus(row.contentStatus));
  return groupBy(visible, (row) => row.wordId);
}

export async function loadPatternsByWordId(
  wordIds: readonly number[],
  options: LoadWordContentOptions = {},
): Promise<Map<number, PatternRow[]>> {
  if (!wordIds.length) return new Map();
  const rows = await db.select().from(wordPatterns)
    .where(inArray(wordPatterns.wordId, [...wordIds]))
    .orderBy(wordPatterns.wordId, wordPatterns.position, wordPatterns.id);
  const visible = options.includeUnpublished ? rows : rows.filter((row) => isPublishedStatus(row.contentStatus));
  return groupBy(visible, (row) => row.wordId);
}

export async function loadPronunciationsByWordId(wordIds: readonly number[]): Promise<Map<number, PronunciationRow[]>> {
  if (!wordIds.length) return new Map();
  const rows = await db.select().from(wordPronunciations)
    .where(inArray(wordPronunciations.wordId, [...wordIds]))
    .orderBy(wordPronunciations.wordId, wordPronunciations.position, wordPronunciations.id);
  return groupBy(rows, (row) => row.wordId);
}

export async function loadTopicNamesByWordId(wordIds: readonly number[]): Promise<Map<number, string[]>> {
  if (!wordIds.length) return new Map();
  const rows = await db.select({ wordId: wordTopics.wordId, name: topics.name })
    .from(wordTopics)
    .innerJoin(topics, eq(topics.id, wordTopics.topicId))
    .where(inArray(wordTopics.wordId, [...wordIds]))
    .orderBy(topics.name);
  const grouped = new Map<number, string[]>();
  for (const row of rows) grouped.set(row.wordId, [...(grouped.get(row.wordId) || []), row.name]);
  return grouped;
}

export async function loadFamiliesByWordId(wordIds: readonly number[]): Promise<Map<number, WordContent["families"]>> {
  if (!wordIds.length) return new Map();
  const memberships = await db.select({
    familyId: wordFamilyMembers.familyId, wordId: wordFamilyMembers.wordId,
    relation: wordFamilyMembers.relation, position: wordFamilyMembers.position,
  }).from(wordFamilyMembers).where(inArray(wordFamilyMembers.wordId, [...wordIds]))
    .orderBy(wordFamilyMembers.position, wordFamilyMembers.id);
  if (!memberships.length) return new Map();

  const familyIds = [...new Set(memberships.map((item) => item.familyId))];
  const [families, members, memberWords] = await Promise.all([
    db.select({ id: wordFamilies.id, label: wordFamilies.label }).from(wordFamilies).where(inArray(wordFamilies.id, familyIds)),
    db.select({ familyId: wordFamilyMembers.familyId, wordId: wordFamilyMembers.wordId, relation: wordFamilyMembers.relation })
      .from(wordFamilyMembers).where(inArray(wordFamilyMembers.familyId, familyIds))
      .orderBy(wordFamilyMembers.position, wordFamilyMembers.id),
    db.select({ id: words.id, term: words.term, meaning: words.meaning }).from(words)
      .where(inArray(words.id, [...new Set(memberships.map((item) => item.wordId))])),
  ]);
  const wordsById = new Map(memberWords.map((word) => [word.id, word]));
  const membersByFamily = new Map<number, FamilyMemberRow[]>();
  for (const member of members) {
    const word = wordsById.get(member.wordId);
    if (!word) continue;
    membersByFamily.set(member.familyId, [
      ...(membersByFamily.get(member.familyId) || []),
      { wordId: member.wordId, term: word.term, meaning: word.meaning, relation: member.relation },
    ]);
  }
  const familiesById = new Map(families.map((family) => [family.id, family]));
  const grouped = new Map<number, WordContent["families"]>();
  for (const membership of memberships) {
    const family = familiesById.get(membership.familyId);
    if (!family) continue;
    const entry = { id: family.id, label: family.label, members: membersByFamily.get(family.id) || [] };
    const existing = grouped.get(membership.wordId) || [];
    if (!existing.some((item) => item.id === family.id)) grouped.set(membership.wordId, [...existing, entry]);
  }
  return grouped;
}

export async function loadWordContent(
  wordIds: readonly number[],
  options: LoadWordContentOptions = {},
): Promise<Map<number, WordContent>> {
  const ids = [...new Set(wordIds)];
  if (!ids.length) return new Map();
  const [collocations, patterns, topicNames, pronunciations, families] = await Promise.all([
    loadCollocationsByWordId(ids, options),
    loadPatternsByWordId(ids, options),
    loadTopicNamesByWordId(ids),
    loadPronunciationsByWordId(ids),
    loadFamiliesByWordId(ids),
  ]);
  const content = new Map<number, WordContent>();
  for (const id of ids) {
    content.set(id, {
      collocations: collocations.get(id) || [],
      patterns: patterns.get(id) || [],
      topics: topicNames.get(id) || [],
      pronunciations: pronunciations.get(id) || [],
      families: families.get(id) || [],
    });
  }
  return content;
}

/** Cheap per-word content counts used to enable/disable practice modes. */
export async function loadContentCountsByWordId(wordIds: readonly number[]) {
  const ids = [...new Set(wordIds)];
  if (!ids.length) return new Map<number, { collocations: number; patterns: number }>();
  const [collocations, patterns] = await Promise.all([
    db.select({ wordId: wordCollocations.wordId }).from(wordCollocations).where(inArray(wordCollocations.wordId, ids)),
    db.select({ wordId: wordPatterns.wordId }).from(wordPatterns).where(inArray(wordPatterns.wordId, ids)),
  ]);
  const counts = new Map<number, { collocations: number; patterns: number }>();
  for (const id of ids) counts.set(id, { collocations: 0, patterns: 0 });
  for (const row of collocations) {
    const entry = counts.get(row.wordId);
    if (entry) entry.collocations += 1;
  }
  for (const row of patterns) {
    const entry = counts.get(row.wordId);
    if (entry) entry.patterns += 1;
  }
  return counts;
}

export type SkillRow = {
  wordId: number; skill: string; attempts: number; correctCount: number;
  assistedCount: number; streak: number; mastery: number | null; lastMode: string | null;
  lastPracticedAt: Date | null;
};

/** Bounded skill-mastery read: only the requested words, only the given user. */
export async function loadSkillRows(userId: number, wordIds: readonly number[], skills?: readonly string[]): Promise<SkillRow[]> {
  const ids = [...new Set(wordIds)];
  if (!ids.length) return [];
  const filters = [eq(wordSkillProgress.userId, userId), inArray(wordSkillProgress.wordId, ids)];
  if (skills?.length) filters.push(inArray(wordSkillProgress.skill, [...skills]));
  return db.select({
    wordId: wordSkillProgress.wordId, skill: wordSkillProgress.skill,
    attempts: wordSkillProgress.attempts, correctCount: wordSkillProgress.correctCount,
    assistedCount: wordSkillProgress.assistedCount, streak: wordSkillProgress.streak,
    mastery: wordSkillProgress.mastery, lastMode: wordSkillProgress.lastMode,
    lastPracticedAt: wordSkillProgress.lastPracticedAt,
  }).from(wordSkillProgress).where(and(...filters));
}

export async function loadSkillRowsByWord(userId: number, wordIds: readonly number[], skills?: readonly string[]) {
  const rows = await loadSkillRows(userId, wordIds, skills);
  return groupBy(rows, (row) => row.wordId);
}
