import { and, eq, exists, ilike, inArray, or, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  topics, wordCollocations, wordFamilyMembers, wordFamilies, wordPatterns, wordTopics, words,
} from "@/db/schema";

/**
 * Search is intentionally tolerant: it may match collocations, patterns, topics
 * and word-family labels. Answer grading stays strict elsewhere. Callers keep
 * applying their own folder/class ACL — this module only widens *what inside an
 * already accessible word* can match, and never exposes draft content to
 * students.
 */

export function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export type DepthSearchOptions = { includeUnpublished?: boolean };

export function wordDepthSearchFilter(pattern: string, options: DepthSearchOptions = {}) {
  const hideDrafts = (column: AnyPgColumn) =>
    options.includeUnpublished ? undefined : sql`${column} <> 'draft'`;

  return or(
    exists(db.select({ one: sql`1` }).from(wordCollocations).where(and(
      eq(wordCollocations.wordId, words.id),
      ilike(wordCollocations.phrase, pattern),
      hideDrafts(wordCollocations.contentStatus),
    ))),
    exists(db.select({ one: sql`1` }).from(wordPatterns).where(and(
      eq(wordPatterns.wordId, words.id),
      ilike(wordPatterns.pattern, pattern),
      hideDrafts(wordPatterns.contentStatus),
    ))),
    exists(db.select({ one: sql`1` }).from(wordTopics)
      .innerJoin(topics, eq(topics.id, wordTopics.topicId))
      .where(and(eq(wordTopics.wordId, words.id), ilike(topics.name, pattern)))),
    exists(db.select({ one: sql`1` }).from(wordFamilyMembers)
      .innerJoin(wordFamilies, eq(wordFamilies.id, wordFamilyMembers.familyId))
      .where(and(eq(wordFamilyMembers.wordId, words.id), ilike(wordFamilies.label, pattern)))),
  );
}

export type DepthMatch = {
  collocations: string[];
  patterns: string[];
  topics: string[];
  families: string[];
};

export const EMPTY_DEPTH_MATCH: DepthMatch = { collocations: [], patterns: [], topics: [], families: [] };

const MAX_MATCH_WORDS = 60;

/** Which linked entry actually matched, so the UI can show "make a decision". */
export async function loadDepthMatches(
  wordIds: readonly number[],
  query: string,
  options: DepthSearchOptions = {},
): Promise<Map<number, DepthMatch>> {
  const ids = [...new Set(wordIds)].slice(0, MAX_MATCH_WORDS);
  const result = new Map<number, DepthMatch>();
  if (!ids.length || !query.trim()) return result;
  const pattern = `%${escapeLikePattern(query.trim())}%`;
  const entry = (wordId: number) => {
    const current = result.get(wordId) || { ...EMPTY_DEPTH_MATCH };
    result.set(wordId, current);
    return current;
  };
  const published = (status: string) => options.includeUnpublished || status !== "draft";

  const [collocations, patterns, topicRows, familyRows] = await Promise.all([
    db.select({ wordId: wordCollocations.wordId, phrase: wordCollocations.phrase, contentStatus: wordCollocations.contentStatus })
      .from(wordCollocations)
      .where(and(inArray(wordCollocations.wordId, ids), ilike(wordCollocations.phrase, pattern))),
    db.select({ wordId: wordPatterns.wordId, pattern: wordPatterns.pattern, contentStatus: wordPatterns.contentStatus })
      .from(wordPatterns)
      .where(and(inArray(wordPatterns.wordId, ids), ilike(wordPatterns.pattern, pattern))),
    db.select({ wordId: wordTopics.wordId, name: topics.name }).from(wordTopics)
      .innerJoin(topics, eq(topics.id, wordTopics.topicId))
      .where(and(inArray(wordTopics.wordId, ids), ilike(topics.name, pattern))),
    db.select({ wordId: wordFamilyMembers.wordId, label: wordFamilies.label }).from(wordFamilyMembers)
      .innerJoin(wordFamilies, eq(wordFamilies.id, wordFamilyMembers.familyId))
      .where(and(inArray(wordFamilyMembers.wordId, ids), ilike(wordFamilies.label, pattern))),
  ]);

  for (const row of collocations) {
    if (!published(row.contentStatus)) continue;
    entry(row.wordId).collocations.push(row.phrase);
  }
  for (const row of patterns) {
    if (!published(row.contentStatus)) continue;
    entry(row.wordId).patterns.push(row.pattern);
  }
  for (const row of topicRows) entry(row.wordId).topics.push(row.name);
  for (const row of familyRows) entry(row.wordId).families.push(row.label);
  return result;
}
