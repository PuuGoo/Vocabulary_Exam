import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { classMembers, vocabSets, words } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { recordSkillOutcomes } from "@/lib/skillProgress";
import { loadCollocationsByWordId, loadPatternsByWordId, loadSkillRowsByWord } from "@/lib/wordContent";
import { WORD_SKILL_LIST, availableSkillsForContent, isWordSkill, summarizeSkillMastery } from "@/lib/wordSkills";
import { buildClozeEligibility } from "@/lib/vocabularyPractice";

const MAX_WORDS = 500;

async function accessibleWordFilter(userId: number, role: string) {
  if (role === "admin") return undefined;
  const memberships = await db.select({ classId: classMembers.classId }).from(classMembers).where(eq(classMembers.userId, userId));
  const classIds = memberships.map((item) => item.classId);
  return classIds.length ? or(isNull(vocabSets.classId), inArray(vocabSets.classId, classIds)) : isNull(vocabSets.classId);
}

async function resolveRequestedWords(req: NextRequest, userId: number, role: string) {
  const url = new URL(req.url);
  const setId = Number(url.searchParams.get("setId"));
  const rawIds = url.searchParams.get("wordIds");
  const wordIds = rawIds ? rawIds.split(",").map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0) : [];
  if (!Number.isInteger(setId) && !wordIds.length) return null;

  const allowed = await accessibleWordFilter(userId, role);
  const query = db.select({ id: words.id, term: words.term, example: words.example, ipa: words.ipa, contentKind: words.contentKind })
    .from(words).innerJoin(vocabSets, eq(vocabSets.id, words.setId));
  const scope = Number.isInteger(setId) ? eq(words.setId, setId) : inArray(words.id, wordIds);
  const rows = allowed ? await query.where(and(scope, allowed)).limit(MAX_WORDS) : await query.where(scope).limit(MAX_WORDS);
  return rows;
}

/** Bounded per-word mastery summary: only the requested words, only this user. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requested = await resolveRequestedWords(req, session.userId, session.role);
  if (!requested) return NextResponse.json({ error: "Thiếu setId hoặc wordIds." }, { status: 400 });
  if (!requested.length) return NextResponse.json({ words: [] });

  const ids = requested.map((word) => word.id);
  const [skillRows, collocations, patterns] = await Promise.all([
    loadSkillRowsByWord(session.userId, ids, WORD_SKILL_LIST),
    loadCollocationsByWordId(ids),
    loadPatternsByWordId(ids),
  ]);

  const result = requested.map((word) => {
    const available = availableSkillsForContent({
      hasTerm: Boolean(word.term?.trim()),
      hasIpa: Boolean(word.ipa?.trim()),
      hasCloze: buildClozeEligibility(word).eligible,
      hasCollocations: (collocations.get(word.id) || []).length > 0,
      hasPatterns: (patterns.get(word.id) || []).length > 0 || Boolean(word.term?.trim()),
    });
    return { wordId: word.id, availableSkills: available, ...summarizeSkillMastery(skillRows.get(word.id) || [], available) };
  });

  return NextResponse.json({ words: result });
}

const postSchema = z.object({
  mode: z.string().min(1).max(32),
  items: z.array(z.object({
    wordId: z.number().int().positive(),
    skill: z.string().min(1).max(32),
    correct: z.boolean(),
    assisted: z.boolean().optional(),
  })).min(1).max(2000),
  syncWordProgress: z.boolean().optional(),
  recordMistakes: z.boolean().optional(),
});

/**
 * Direct skill recording for flows that do not create an `attempts` row
 * (flashcard self-rating, in-review drills). Word-level SRS stays opt-in so a
 * session is never counted twice.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  const invalid = parsed.data.items.filter((item) => !isWordSkill(item.skill));
  if (invalid.length) return NextResponse.json({ error: `Kỹ năng không hợp lệ: ${invalid[0].skill}` }, { status: 400 });

  const result = await recordSkillOutcomes(session.userId, parsed.data.items, {
    mode: parsed.data.mode,
    syncWordProgress: parsed.data.syncWordProgress ?? false,
    recordMistakes: parsed.data.recordMistakes ?? false,
  });
  return NextResponse.json({ ok: true, ...result });
}
