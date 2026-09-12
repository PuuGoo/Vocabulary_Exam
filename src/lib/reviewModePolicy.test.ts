import assert from "node:assert/strict";
import test from "node:test";
import { describeReason, dominantReason, limitConsecutiveModes, modeForSkillMastery, recommendReviewMode, reviewModeHref } from "./reviewModePolicy";
import { availableSkillsForContent, rankSkillsForPractice, summarizeSkillMastery } from "./wordSkills";

const richContent = availableSkillsForContent({ hasTerm: true, hasIpa: true, hasCollocations: true, hasPatterns: true, hasCloze: true });
const abandonRows = [
  { skill: "meaning_recognition", attempts: 14, correctCount: 14, assistedCount: 0 },
  { skill: "spelling_production", attempts: 12, correctCount: 12, assistedCount: 0 },
  { skill: "collocation_usage", attempts: 5, correctCount: 1, assistedCount: 0 },
  { skill: "pattern_usage", attempts: 9, correctCount: 8, assistedCount: 0 },
];
const implementedModes = ["fill", "mc", "collocation", "pattern", "cloze", "pronunciation", "dictation"];

function recommend(rows: typeof abandonRows, modes = implementedModes, reasons: string[] = ["due"]) {
  const summary = summarizeSkillMastery(rows, richContent);
  return recommendReviewMode({
    reasons: reasons as never,
    skillPriorities: rankSkillsForPractice(summary, richContent),
    availableModes: modes,
    fallbackMode: "fill",
  });
}

test("Smart Review targets the weak dimension, not the meaning the learner already knows", () => {
  const recommendation = recommend(abandonRows);
  assert.equal(recommendation.skill, "collocation_usage");
  assert.equal(recommendation.mode, "collocation");
  assert.equal(recommendation.reason, "weak_skill");
  assert.equal(recommendation.label, "Collocation còn yếu");
});

test("a mode is only recommended when it is actually implemented for that word", () => {
  // Collocation content is missing, so the next untouched dimension with a real
  // mode wins; pattern mastery (75%) is not weak enough to be forced.
  const withoutCollocations = recommend(abandonRows, ["fill", "mc", "pattern", "cloze"]);
  assert.equal(withoutCollocations.skill, "context_usage");
  assert.equal(withoutCollocations.mode, "cloze");
  assert.equal(withoutCollocations.reason, "unpracticed");

  const nothingExtra = recommend(abandonRows, ["fill", "mc"]);
  assert.equal(nothingExtra.mode, "fill");
});

test("existing scheduling reasons stay dominant and keep their wording", () => {
  const overdue = recommend(abandonRows, implementedModes, ["overdue", "due"]);
  assert.equal(overdue.reason, "overdue");
  assert.equal(overdue.mode, "collocation");
  assert.equal(overdue.label, "Đã quá hạn ôn");

  const difficult = recommend(abandonRows, implementedModes, ["difficult"]);
  assert.equal(difficult.reason, "difficult");
  assert.equal(dominantReason(["due", "forgotten", "stale"]), "forgotten");
  assert.equal(describeReason("unpracticed", "pattern_usage"), "Chưa luyện Cấu trúc");
});

test("mastery escalates from recognition to production for the same word", () => {
  assert.equal(modeForSkillMastery("meaning_recognition", 20, ["mc", "fill"]), "mc");
  assert.equal(modeForSkillMastery("meaning_recognition", 90, ["mc", "fill"]), "fill");
  assert.equal(modeForSkillMastery("meaning_recognition", null, ["mc", "fill"]), "mc");
  assert.equal(modeForSkillMastery("collocation_usage", 10, ["collocation"]), "collocation");
  assert.equal(modeForSkillMastery("collocation_usage", 10, ["fill"]), null);
});

test("one session never repeats the same mode four times in a row", () => {
  const planned = [
    { mode: "collocation" }, { mode: "collocation" }, { mode: "collocation" },
    { mode: "collocation" }, { mode: "cloze" }, { mode: "collocation" },
  ];
  const ordered = limitConsecutiveModes(planned, 2).map((item) => item.mode);
  assert.deepEqual(ordered, ["collocation", "collocation", "cloze", "collocation", "collocation", "collocation"]);
  assert.equal(limitConsecutiveModes([{ mode: "fill" }, { mode: "fill" }], 1).length, 2);
});

test("recommended modes map onto real learning routes", () => {
  assert.equal(reviewModeHref("collocation", 7), "/collocation/7");
  assert.equal(reviewModeHref("cloze", 7), "/cloze/7");
  assert.equal(reviewModeHref("pattern", 7), "/pattern/7");
  assert.equal(reviewModeHref("fill", 7), "/quiz/7?mode=fill");
  assert.equal(reviewModeHref("pronunciation", 7), "/pronunciation/7");
  assert.equal(reviewModeHref("unknown-mode", 7), null);
  assert.equal(reviewModeHref(null, 7), null);
});
