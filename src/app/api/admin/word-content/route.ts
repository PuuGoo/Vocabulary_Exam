import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  topics, wordCollocations, wordFamilyMembers, wordFamilies, wordPatterns, wordPronunciations, wordTopics, words,
} from "@/db/schema";
import { getSession } from "@/lib/auth";
import { normalizeText } from "@/lib/text";
import { loadWordContent } from "@/lib/wordContent";
import { normalizeContentStatus, normalizeRegister } from "@/lib/vocabularyMeta";

export const runtime = "nodejs";

const statusSchema = z.enum(["draft", "reviewed", "approved"]).optional().nullable();

const collocationSchema = z.object({
  id: z.number().int().positive().optional().nullable(),
  phrase: z.string().trim().min(1).max(400),
  meaning: z.string().trim().max(600).optional().nullable(),
  example: z.string().trim().max(1200).optional().nullable(),
  register: z.string().trim().max(24).optional().nullable(),
  contentStatus: statusSchema,
});

const patternSchema = z.object({
  id: z.number().int().positive().optional().nullable(),
  pattern: z.string().trim().min(1).max(400),
  meaning: z.string().trim().max(600).optional().nullable(),
  example: z.string().trim().max(1200).optional().nullable(),
  contentStatus: statusSchema,
});

const pronunciationSchema = z.object({
  id: z.number().int().positive().optional().nullable(),
  ipa: z.string().trim().min(1).max(128),
  partOfSpeech: z.string().trim().max(32).optional().nullable(),
  sense: z.string().trim().max(400).optional().nullable(),
  locale: z.string().trim().max(16).optional().nullable(),
  isPrimary: z.boolean().optional(),
});

const familySchema = z.object({
  label: z.string().trim().min(1).max(128),
  members: z.array(z.object({
    wordId: z.number().int().positive(),
    relation: z.string().trim().max(32).optional().nullable(),
  })).max(40),
}).nullable().optional();

const bodySchema = z.object({
  wordId: z.number().int().positive(),
  collocations: z.array(collocationSchema).max(80).optional(),
  patterns: z.array(patternSchema).max(80).optional(),
  pronunciations: z.array(pronunciationSchema).max(20).optional(),
  topics: z.array(z.string().trim().min(1).max(128)).max(30).optional(),
  family: familySchema,
});

const MAX_WORD_IDS = 300;

type DbClient = typeof db;
type Transaction = Parameters<Parameters<DbClient["transaction"]>[0]>[0];
/** Every write below runs inside one transaction so a failed save leaves no partial content. */
type DbLike = DbClient | Transaction;

/** Admin view of the 1-to-many vocabulary depth data, drafts included. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const ids = (url.searchParams.get("wordIds") || url.searchParams.get("wordId") || "")
    .split(",").map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)
    .slice(0, MAX_WORD_IDS);
  if (!ids.length) return NextResponse.json({ error: "Thiếu wordId." }, { status: 400 });

  const content = await loadWordContent(ids, { includeUnpublished: true });
  const allTopics = await db.select({ id: topics.id, name: topics.name }).from(topics).orderBy(topics.name);
  return NextResponse.json({
    content: Object.fromEntries(content),
    topics: allTopics.map((topic) => topic.name),
  });
}

async function syncCollocations(client: DbLike, wordId: number, rows: z.infer<typeof collocationSchema>[]) {
  const keepIds = rows.map((row) => row.id).filter((id): id is number => typeof id === "number");
  const removed = keepIds.length
    ? and(eq(wordCollocations.wordId, wordId), notInArray(wordCollocations.id, keepIds))
    : eq(wordCollocations.wordId, wordId);
  await client.delete(wordCollocations).where(removed);
  await Promise.all(rows.map(async (row, index) => {
    const values = {
      wordId,
      phrase: normalizeText(row.phrase),
      meaning: row.meaning ? normalizeText(row.meaning) : null,
      example: row.example ? normalizeText(row.example) : null,
      register: normalizeRegister(row.register),
      contentStatus: normalizeContentStatus(row.contentStatus) ?? "approved",
      position: index,
      updatedAt: new Date(),
    };
    if (row.id) {
      await client.update(wordCollocations).set(values).where(and(eq(wordCollocations.id, row.id), eq(wordCollocations.wordId, wordId)));
      return;
    }
    await client.insert(wordCollocations).values(values).onConflictDoNothing({ target: [wordCollocations.wordId, wordCollocations.phrase] });
  }));
}

async function syncPatterns(client: DbLike, wordId: number, rows: z.infer<typeof patternSchema>[]) {
  const keepIds = rows.map((row) => row.id).filter((id): id is number => typeof id === "number");
  const removed = keepIds.length
    ? and(eq(wordPatterns.wordId, wordId), notInArray(wordPatterns.id, keepIds))
    : eq(wordPatterns.wordId, wordId);
  await client.delete(wordPatterns).where(removed);
  await Promise.all(rows.map(async (row, index) => {
    const values = {
      wordId,
      pattern: normalizeText(row.pattern),
      meaning: row.meaning ? normalizeText(row.meaning) : null,
      example: row.example ? normalizeText(row.example) : null,
      contentStatus: normalizeContentStatus(row.contentStatus) ?? "approved",
      position: index,
      updatedAt: new Date(),
    };
    if (row.id) {
      await client.update(wordPatterns).set(values).where(and(eq(wordPatterns.id, row.id), eq(wordPatterns.wordId, wordId)));
      return;
    }
    await client.insert(wordPatterns).values(values).onConflictDoNothing({ target: [wordPatterns.wordId, wordPatterns.pattern] });
  }));
}

async function syncPronunciations(client: DbLike, wordId: number, rows: z.infer<typeof pronunciationSchema>[]) {
  const keepIds = rows.map((row) => row.id).filter((id): id is number => typeof id === "number");
  await client.delete(wordPronunciations).where(keepIds.length
    ? and(eq(wordPronunciations.wordId, wordId), notInArray(wordPronunciations.id, keepIds))
    : eq(wordPronunciations.wordId, wordId));
  await Promise.all(rows.map(async (row, index) => {
    const values = {
      wordId,
      ipa: normalizeText(row.ipa),
      partOfSpeech: row.partOfSpeech ? normalizeText(row.partOfSpeech) : null,
      sense: row.sense ? normalizeText(row.sense) : null,
      // UK IPA stays canonical for English; the locale is explicit, never overwritten silently.
      locale: row.locale?.trim() || "en-GB",
      isPrimary: row.isPrimary ?? index === 0,
      position: index,
      updatedAt: new Date(),
    };
    if (row.id) {
      await client.update(wordPronunciations).set(values).where(and(eq(wordPronunciations.id, row.id), eq(wordPronunciations.wordId, wordId)));
      return;
    }
    await client.insert(wordPronunciations).values(values);
  }));
}

async function syncTopics(client: DbLike, wordId: number, names: string[], userId: number) {
  const cleaned = [...new Set(names.map((name) => normalizeText(name.trim())).filter(Boolean))];
  await client.delete(wordTopics).where(eq(wordTopics.wordId, wordId));
  if (!cleaned.length) return;
  await client.insert(topics).values(cleaned.map((name) => ({ name, createdBy: userId })))
    .onConflictDoNothing({ target: topics.name });
  const rows = await client.select({ id: topics.id, name: topics.name }).from(topics).where(inArray(topics.name, cleaned));
  if (!rows.length) return;
  await client.insert(wordTopics).values(rows.map((topic) => ({ wordId, topicId: topic.id })))
    .onConflictDoNothing({ target: [wordTopics.wordId, wordTopics.topicId] });
}

async function syncFamily(client: DbLike, wordId: number, family: z.infer<typeof familySchema>, userId: number) {
  if (family === null) {
    await client.delete(wordFamilyMembers).where(eq(wordFamilyMembers.wordId, wordId));
    return;
  }
  if (!family) return;
  const label = normalizeText(family.label.trim());
  const [existing] = await client.insert(wordFamilies).values({ label, createdBy: userId })
    .onConflictDoNothing({ target: wordFamilies.label }).returning({ id: wordFamilies.id });
  const familyId = existing?.id ?? (await client.select({ id: wordFamilies.id }).from(wordFamilies).where(eq(wordFamilies.label, label)).limit(1))[0]?.id;
  if (!familyId) return;

  const memberWordIds = [...new Set([wordId, ...family.members.map((member) => member.wordId)])];
  const validWords = await client.select({ id: words.id }).from(words).where(inArray(words.id, memberWordIds));
  const validIds = new Set(validWords.map((word) => word.id));
  await client.delete(wordFamilyMembers).where(eq(wordFamilyMembers.familyId, familyId));
  const relations = new Map(family.members.map((member) => [member.wordId, member.relation ? normalizeText(member.relation) : null]));
  const values = memberWordIds.filter((id) => validIds.has(id)).map((id, index) => ({
    familyId, wordId: id, relation: relations.get(id) ?? (id === wordId ? "base" : null), position: index,
  }));
  if (values.length) {
    await client.insert(wordFamilyMembers).values(values)
      .onConflictDoNothing({ target: [wordFamilyMembers.familyId, wordFamilyMembers.wordId] });
  }
  await client.update(wordFamilies).set({ updatedAt: new Date() }).where(eq(wordFamilies.id, familyId));
}

/**
 * Replaces the linked 1-to-many content for one word. Rows keep their ids when
 * they are edited, so future per-collocation progress never dangles.
 */
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ.", issues: parsed.error.flatten() }, { status: 400 });
  const { wordId, collocations, patterns, pronunciations, topics: topicNames, family } = parsed.data;

  const [word] = await db.select({ id: words.id }).from(words).where(eq(words.id, wordId)).limit(1);
  if (!word) return NextResponse.json({ error: "Không tìm thấy từ." }, { status: 404 });

  await db.transaction(async (tx) => {
    if (collocations) await syncCollocations(tx, wordId, collocations);
    if (patterns) await syncPatterns(tx, wordId, patterns);
    if (pronunciations) await syncPronunciations(tx, wordId, pronunciations);
    if (topicNames) await syncTopics(tx, wordId, topicNames, session.userId);
    if (family !== undefined) await syncFamily(tx, wordId, family, session.userId);
  });

  const content = await loadWordContent([wordId], { includeUnpublished: true });
  return NextResponse.json({ ok: true, content: Object.fromEntries(content)[wordId] ?? null });
}
