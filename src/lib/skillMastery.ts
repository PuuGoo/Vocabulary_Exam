import type { LearningSkill, SkillResult } from "./learningSkills";
import { LEARNING_SKILLS, LEARNING_SKILL_LABELS, masteryLabel, nextMasteryScore, resultQuality, SKILL_RECOMMENDED_MODE } from "./learningSkills";

export type SkillProgressSnapshot = { skill: LearningSkill; masteryScore: number; practiceCount: number; lastPracticedAt?: Date | string | null };

export function applySkillOutcome(previous: Pick<SkillProgressSnapshot, "masteryScore" | "practiceCount"> | null, result: SkillResult) {
  const quality = resultQuality(result);
  return {
    masteryScore: nextMasteryScore(previous?.masteryScore, quality),
    practiceCount: (previous?.practiceCount || 0) + 1,
    successDelta: result === "correct" || result === "assisted" ? 1 : 0,
    failureDelta: result === "incorrect" || result === "near_miss" ? 1 : 0,
    quality,
  };
}

export function summarizeSkillProgress(rows: SkillProgressSnapshot[]) {
  const bySkill = new Map(rows.map((row) => [row.skill, row]));
  return LEARNING_SKILLS.map((skill) => {
    const row = bySkill.get(skill);
    return { skill, label: LEARNING_SKILL_LABELS[skill], masteryScore: row?.masteryScore ?? null, practiceCount: row?.practiceCount || 0, masteryLabel: masteryLabel(row?.masteryScore, row?.practiceCount), recommendedMode: SKILL_RECOMMENDED_MODE[skill] };
  });
}

export function weakestEligibleSkill(rows: SkillProgressSnapshot[], eligible: readonly LearningSkill[]) {
  const bySkill = new Map(rows.map((row) => [row.skill, row]));
  return [...eligible].filter((skill) => bySkill.has(skill)).sort((left, right) => {
    const a = bySkill.get(left)!; const b = bySkill.get(right)!;
    return a.masteryScore - b.masteryScore || a.practiceCount - b.practiceCount;
  })[0] || null;
}
