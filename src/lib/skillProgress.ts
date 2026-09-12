import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { mistakes, words, wordSkillProgress } from "@/db/schema";
import { recordWordOutcomes } from "@/lib/spacedProgress";
import {
  MISTAKE_REASON_FOR_SKILL, applySkillOutcome, isWordSkill, summarizeSkillMastery,
  type SkillMasterySummary, type WordSkill,
} from "@/lib/wordSkills";

/**
 * Skill mastery is behavioural evidence layered on top of the existing SRS.
 * `wordProgress` (known / nextReviewAt / streaks) stays the single scheduling
 * source of truth; this module never creates a second review system, it only
 * records *which dimension* was practised and how it went.
 */

export type SkillOutcomeInput = {
  wordId: number;
  skill: string;
  correct: boolean;
  /** Hint, reveal or pre-answer audio: still correct, but weaker evidence. */
  assisted?: boolean;
};

export type RecordSkillOptions = {
  mode?: string;
  /** Aggregate one word-level SRS outcome per word so due dates keep moving. */
  syncWordProgress?: boolean;
  /** Enrich the existing mistakes table with why the answer was wrong. */
  recordMistakes?: boolean;
};

export async function recordSkillOutcomes(
  userId: number,
  outcomes: readonly SkillOutcomeInput[],
  options: RecordSkillOptions = {},
): Promise<{ recorded: number }> {
  const valid = outcomes.filter((outcome) => isWordSkill(outcome.skill) && Number.isInteger(outcome.wordId));
  if (!valid.length) return { recorded: 0 };

  // The same word+skill can legitimately be attempted several times in one
  // session (blank task and phrase task, retries, ...). Fold repeats instead of
  // dropping them so evidence and streaks stay honest.
  const grouped = new Map<string, SkillOutcomeInput[]>();
  for (const outcome of valid) {
    const key = `${outcome.wordId}:${outcome.skill}`;
    grouped.set(key, [...(grouped.get(key) || []), outcome]);
  }
  const deduplicated = [...grouped.values()];
  const wordIds = [...new Set(valid.map((outcome) => outcome.wordId))];

  const wordRows = await db.select({ id: words.id, setId: words.setId }).from(words).where(inArray(words.id, wordIds));
  const setByWordId = new Map(wordRows.map((row) => [row.id, row.setId]));
  const knownOutcomes = deduplicated.filter((group) => setByWordId.has(group[0].wordId));
  if (!knownOutcomes.length) return { recorded: 0 };

  const existing = await db.select().from(wordSkillProgress).where(and(
    eq(wordSkillProgress.userId, userId),
    inArray(wordSkillProgress.wordId, wordIds),
  ));
  const previousByKey = new Map(existing.map((row) => [`${row.wordId}:${row.skill}`, row]));
  const practicedAt = new Date();

  const rows = knownOutcomes.map((group) => {
    const first = group[0];
    const skill = first.skill as WordSkill;
    let next = applySkillOutcome(previousByKey.get(`${first.wordId}:${skill}`), {
      correct: first.correct,
      assisted: first.assisted,
    });
    for (const outcome of group.slice(1)) {
      next = applySkillOutcome(next, { correct: outcome.correct, assisted: outcome.assisted });
    }
    return {
      userId,
      wordId: first.wordId,
      skill,
      attempts: next.attempts,
      correctCount: next.correctCount,
      assistedCount: next.assistedCount,
      streak: next.streak,
      mastery: next.mastery,
      lastMode: options.mode ?? null,
      lastResult: group[group.length - 1].correct,
      lastPracticedAt: practicedAt,
      updatedAt: practicedAt,
    };
  });

  await db.insert(wordSkillProgress).values(rows).onConflictDoUpdate({
    target: [wordSkillProgress.userId, wordSkillProgress.wordId, wordSkillProgress.skill],
    set: {
      attempts: sql`excluded.attempts`,
      correctCount: sql`excluded.correct_count`,
      assistedCount: sql`excluded.assisted_count`,
      streak: sql`excluded.streak`,
      mastery: sql`excluded.mastery`,
      lastMode: sql`excluded.last_mode`,
      lastResult: sql`excluded.last_result`,
      lastPracticedAt: sql`excluded.last_practiced_at`,
      updatedAt: sql`excluded.updated_at`,
    },
  });

  if (options.recordMistakes) {
    // A word counts as a mistake when its final attempt in the batch was wrong.
    const wrong = knownOutcomes.filter((group) => !group[group.length - 1].correct);
    for (const outcome of wrong) {
      const last = outcome[outcome.length - 1];
      const setId = setByWordId.get(last.wordId);
      if (!setId) continue;
      await db.insert(mistakes).values({
        userId,
        wordId: last.wordId,
        setId,
        timesWrong: 1,
        lastWrongAt: practicedAt,
        lastReason: MISTAKE_REASON_FOR_SKILL[last.skill as WordSkill],
      }).onConflictDoUpdate({
        target: [mistakes.userId, mistakes.wordId],
        set: {
          timesWrong: sql`${mistakes.timesWrong} + 1`,
          lastWrongAt: practicedAt,
          lastReason: MISTAKE_REASON_FOR_SKILL[last.skill as WordSkill],
        },
      });
    }
  }

  if (options.syncWordProgress) {
    const byWord = new Map<number, boolean>();
    for (const group of knownOutcomes) {
      const last = group[group.length - 1];
      byWord.set(last.wordId, (byWord.get(last.wordId) ?? true) && last.correct);
    }
    // One SRS outcome per word: a word practised across three dimensions is
    // still one reviewed word, never three.
    await recordWordOutcomes(userId, [...byWord].map(([wordId, correct]) => ({
      wordId, setId: setByWordId.get(wordId), correct,
    })), options.mode ?? "practice");
  }

  return { recorded: rows.length };
}

export function summarizeWordSkills(
  rows: ReadonlyArray<{ skill: string; attempts: number; correctCount: number; assistedCount: number; streak?: number | null }>,
  available: readonly WordSkill[] = [],
): SkillMasterySummary {
  return summarizeSkillMastery(rows, available.length ? available : undefined);
}
