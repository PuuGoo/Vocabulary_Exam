import assert from "node:assert/strict";
import test from "node:test";
import {
  MIN_SKILL_EVIDENCE, WEAK_SKILL_MASTERY, applySkillOutcome, availableSkillsForContent,
  computeSkillMastery, isWordSkill, rankSkillsForPractice, skillForMode, summarizeSkillMastery,
} from "./wordSkills";

test("unpracticed skills report no score instead of a fake zero", () => {
  assert.equal(computeSkillMastery(null), null);
  assert.equal(computeSkillMastery({ attempts: 0, correctCount: 0, assistedCount: 0 }), null);
  const summary = summarizeSkillMastery([], ["collocation_usage", "meaning_recognition"]);
  assert.equal(summary.overall, null);
  assert.deepEqual(summary.unpracticedSkills, ["collocation_usage", "meaning_recognition"]);
  assert.deepEqual(summary.weakSkills, []);
});

test("a single lucky answer cannot reach 100% mastery", () => {
  const first = applySkillOutcome(null, { correct: true });
  assert.equal(first.attempts, 1);
  assert.ok((first.mastery ?? 0) < 100);
  assert.ok((first.mastery ?? 0) >= 40);
  const assisted = applySkillOutcome(null, { correct: true, assisted: true });
  assert.ok((assisted.mastery ?? 0) < (first.mastery ?? 0));
});

test("repeated clean recalls climb while a slip resets the streak", () => {
  let state = applySkillOutcome(null, { correct: true });
  for (let index = 0; index < 6; index += 1) state = applySkillOutcome(state, { correct: true });
  assert.equal(state.streak, 7);
  assert.ok((state.mastery ?? 0) > WEAK_SKILL_MASTERY);
  const slipped = applySkillOutcome(state, { correct: false });
  assert.equal(slipped.streak, 0);
  assert.ok((slipped.mastery ?? 0) < (state.mastery ?? 0));
});

test("known=true does not imply every skill is strong", () => {
  const rows = [
    { skill: "meaning_recognition", attempts: 12, correctCount: 12, assistedCount: 0 },
    { skill: "spelling_production", attempts: 10, correctCount: 10, assistedCount: 0 },
    { skill: "collocation_usage", attempts: 4, correctCount: 1, assistedCount: 0 },
    { skill: "pattern_usage", attempts: 8, correctCount: 7, assistedCount: 0 },
  ];
  const summary = summarizeSkillMastery(rows, [
    "meaning_recognition", "spelling_production", "collocation_usage", "pattern_usage", "context_usage",
  ]);
  assert.equal(summary.weakSkills[0], "collocation_usage");
  assert.deepEqual(summary.unpracticedSkills, ["context_usage"]);
  assert.ok((summary.bySkill.collocation_usage?.mastery ?? 100) < WEAK_SKILL_MASTERY);
  assert.ok((summary.bySkill.meaning_recognition?.mastery ?? 0) > 80);
});

test("practice ranking prefers the weakest proven skill, then untouched ones", () => {
  const summary = summarizeSkillMastery([
    { skill: "collocation_usage", attempts: MIN_SKILL_EVIDENCE, correctCount: 0, assistedCount: 0 },
    { skill: "pattern_usage", attempts: 6, correctCount: 6, assistedCount: 0 },
  ], ["meaning_recognition", "collocation_usage", "pattern_usage"]);
  const ranked = rankSkillsForPractice(summary, ["meaning_recognition", "collocation_usage", "pattern_usage"]);
  assert.equal(ranked[0].skill, "collocation_usage");
  assert.equal(ranked[0].reason, "weak_skill");
  assert.deepEqual(ranked[1], { skill: "meaning_recognition", mastery: null, reason: "unpracticed" });
  assert.equal(ranked.some((item) => item.skill === "pattern_usage"), false);
});

test("skills without supporting content are never scheduled", () => {
  const available = availableSkillsForContent({ hasTerm: true, hasIpa: false, hasCollocations: false, hasPatterns: false });
  assert.ok(available.includes("spelling_production"));
  assert.equal(available.includes("collocation_usage"), false);
  assert.equal(available.includes("pattern_usage"), false);
  assert.equal(available.includes("pronunciation_recall"), false);
  const rich = availableSkillsForContent({ hasTerm: true, hasIpa: true, hasCollocations: true, hasPatterns: true, hasCloze: true });
  assert.deepEqual(
    [...rich].sort(),
    ["collocation_usage", "context_usage", "listening_recognition", "meaning_recognition", "pattern_usage", "pronunciation_recall", "spelling_production"].sort(),
  );
});

test("existing modes keep mapping onto skills without a second progress system", () => {
  assert.equal(skillForMode("fill"), "spelling_production");
  assert.equal(skillForMode("fill_unknown"), "spelling_production");
  assert.equal(skillForMode("mc"), "meaning_recognition");
  assert.equal(skillForMode("dictation"), "spelling_production");
  assert.equal(skillForMode("pronunciation"), "pronunciation_recall");
  assert.equal(skillForMode("collocation"), "collocation_usage");
  assert.equal(skillForMode("nonsense-mode"), null);
  assert.equal(isWordSkill("collocation_usage"), true);
  assert.equal(isWordSkill("english_word_progress"), false);
});
