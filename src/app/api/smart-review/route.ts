import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { classMembers, mistakes, vocabSets, wordProgress, words } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { availableModesForWord, availableSkillsForWord } from "@/lib/practiceAvailability";
import { recommendReviewMode, type ReviewReasonCode } from "@/lib/reviewModePolicy";
import { loadCollocationsByWordId, loadPatternsByWordId, loadSkillRowsByWord } from "@/lib/wordContent";
import { WORD_SKILL_LIST, rankSkillsForPractice, summarizeSkillMastery } from "@/lib/wordSkills";

const DAY_MS = 24 * 60 * 60 * 1000;
// Skill evidence is loaded for a bounded shortlist only, never for the whole catalogue.
const SKILL_SHORTLIST_MAX = 200;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requestedCount = Number(req.nextUrl.searchParams.get("count"));
  const count = [5, 10, 20].includes(requestedCount) ? requestedCount : 10;

  let classFilter;
  if (session.role !== "admin") {
    const memberships = await db
      .select({ classId: classMembers.classId })
      .from(classMembers)
      .where(eq(classMembers.userId, session.userId));
    const classIds = memberships.map((item) => item.classId);
    classFilter = classIds.length
      ? or(isNull(vocabSets.classId), inArray(vocabSets.classId, classIds))
      : isNull(vocabSets.classId);
  }

  const query = db
    .select({
      id: words.id,
      setId: words.setId,
      setName: vocabSets.name,
      setType: vocabSets.type,
      meaning: words.meaning,
      v1: words.v1,
      v2: words.v2,
      v3: words.v3,
      ipaV1: words.ipaV1,
      ipaV2: words.ipaV2,
      ipaV3: words.ipaV3,
      term: words.term,
      example: words.example,
      wtype: words.wtype,
      ipa: words.ipa,
      known: wordProgress.known,
      reviewedAt: wordProgress.updatedAt,
      nextReviewAt: wordProgress.nextReviewAt,
      intervalDays: wordProgress.intervalDays,
      reviewStreak: wordProgress.reviewStreak,
      timesWrong: mistakes.timesWrong,
    })
    .from(words)
    .innerJoin(vocabSets, eq(vocabSets.id, words.setId))
    .leftJoin(wordProgress, and(eq(wordProgress.wordId, words.id), eq(wordProgress.userId, session.userId)))
    .leftJoin(mistakes, and(eq(mistakes.wordId, words.id), eq(mistakes.userId, session.userId)));

  const candidates = classFilter ? await query.where(classFilter) : await query;
  if (candidates.length === 0) {
    return NextResponse.json({ words: [], summary: { total: 0, due: 0, difficult: 0, forgotten: 0, stale: 0, new: 0 } });
  }

  const now = Date.now();
  const ranked = candidates.map((word) => {
    const ageDays = word.reviewedAt ? Math.max(0, Math.floor((now - word.reviewedAt.getTime()) / DAY_MS)) : null;
    const due = Boolean(word.nextReviewAt && word.nextReviewAt.getTime() <= now);
    let reason: "difficult" | "forgotten" | "stale" | "new" | "weak_skill" | "unpracticed";
    let priority: number;
    if ((word.timesWrong || 0) > 0) {
      reason = "difficult";
      priority = (due ? 600 : 400) + (word.timesWrong || 0) * 20 + (ageDays || 0);
    } else if (word.known === false) {
      reason = "forgotten";
      priority = (due ? 550 : 300) + (ageDays || 0);
    } else if (word.known === true) {
      reason = "stale";
      priority = due ? 500 + (ageDays || 0) : 25;
    } else {
      reason = "new";
      priority = 50;
    }
    return { ...word, ageDays, due, reason, priority, random: Math.random() };
  }).filter((word) => word.due || word.nextReviewAt === null);

  ranked.sort((a, b) => b.priority - a.priority || a.random - b.random);
  const shortlist = ranked.slice(0, Math.min(SKILL_SHORTLIST_MAX, count * 4));
  const enriched = await attachSkillGuidance(session.userId, shortlist);
  enriched.sort((a, b) => b.priority - a.priority || a.random - b.random);
  const selected = enriched.slice(0, count).map(({ priority: _priority, random: _random, ...word }) => word);
  const summary = selected.reduce(
    (result, word) => ({ ...result, [word.reason]: (result[word.reason] || 0) + 1 }),
    { total: selected.length, due: selected.filter((word) => word.due).length, difficult: 0, forgotten: 0, stale: 0, new: 0, weak_skill: 0, unpracticed: 0 } as Record<string, number>
  );

  return NextResponse.json({ words: selected, summary });
}

type RankedWord = {
  id: number; setId: number; setType: string; term: string | null; example: string | null;
  wtype: string | null; ipa: string | null; ageDays: number | null; due: boolean;
  reason: "difficult" | "forgotten" | "stale" | "new" | "weak_skill" | "unpracticed";
  priority: number; random: number;
};

/**
 * Adds "which dimension should I practise" to the existing ranking. Scheduling
 * itself is untouched: a weak skill only nudges priority below due/mistake
 * signals, exactly like the daily review planner.
 */
async function attachSkillGuidance(userId: number, shortlist: RankedWord[]) {
  if (!shortlist.length) return shortlist;
  const ids = shortlist.map((word) => word.id);
  const [collocations, patterns, skillRows] = await Promise.all([
    loadCollocationsByWordId(ids),
    loadPatternsByWordId(ids),
    loadSkillRowsByWord(userId, ids, WORD_SKILL_LIST),
  ]);

  return shortlist.map((word) => {
    const content = { collocations: collocations.get(word.id) || [], patterns: patterns.get(word.id) || [] };
    const available = availableSkillsForWord(word, content);
    const mastery = summarizeSkillMastery(skillRows.get(word.id) || [], available);
    const priorities = rankSkillsForPractice(mastery, available);
    const modes = availableModesForWord(word, content);
    const recommendation = recommendReviewMode({
      reasons: [word.reason] as ReviewReasonCode[],
      skillPriorities: priorities,
      availableModes: modes,
      fallbackMode: modes.includes("fill") ? "fill" : undefined,
    });
    const boosted = recommendation.reason === "weak_skill" ? 60 : recommendation.reason === "unpracticed" ? 20 : 0;
    const reason = boosted && word.reason !== "difficult" && word.reason !== "forgotten"
      ? recommendation.reason
      : word.reason;
    return {
      ...word,
      reason: reason as RankedWord["reason"],
      priority: word.priority + boosted,
      recommendation,
      mastery: { overall: mastery.overall, bySkill: mastery.bySkill },
    };
  });
}
