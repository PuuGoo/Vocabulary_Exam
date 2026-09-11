import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { applySkillOutcome, weakestEligibleSkill } from "./skillMastery";
import { masteryLabel, nextMasteryScore, skillForMode } from "./learningSkills";
import { parsePinyinSyllables } from "./pinyin";
import { buildToneExercise, gradeToneSelection } from "./toneTrainer";
import { buildSentenceCloze } from "./sentenceCloze";
import { rankReviewCandidate, type ReviewWord } from "./reviewPlanner";

test("mastery is deterministic, bounded, evidence-aware and independent by skill", () => {
  assert.equal(nextMasteryScore(null, 100), 100);
  assert.equal(nextMasteryScore(40, 100), 52);
  assert.equal(applySkillOutcome({ masteryScore: 40, practiceCount: 2 }, "assisted").masteryScore, 46);
  assert.equal(masteryLabel(90, 1), "Khá");
  assert.equal(masteryLabel(90, 3), "Vững");
  assert.equal(skillForMode("fill", { target: "pronunciation" }), "pronunciation_recall");
  assert.equal(skillForMode("fill", { target: "term" }), "orthography_production");
  const rows = [
    { skill: "meaning_recognition" as const, masteryScore: 90, practiceCount: 5 },
    { skill: "pronunciation_recall" as const, masteryScore: 35, practiceCount: 5 },
    { skill: "tone_accuracy" as const, masteryScore: 20, practiceCount: 4 },
  ];
  assert.equal(weakestEligibleSkill(rows, ["meaning_recognition", "orthography_production", "pronunciation_recall", "tone_accuracy"]), "tone_accuracy");
});

test("weak skill raises existing review priority without replacing due and mistake signals", () => {
  const base: ReviewWord = { id:1,setId:1,setName:"HSK",known:true,nextReviewAt:null,reviewStreak:5,correctCount:5,wrongCount:0,timesWrong:0 };
  const strong = rankReviewCandidate(base, new Date("2026-01-10"));
  const weak = rankReviewCandidate({ ...base, weakSkill:"tone_accuracy", weakSkillScore:20, recommendedMode:"tone" }, new Date("2026-01-10"));
  assert.ok(weak.priorityScore > strong.priorityScore);
  assert.ok(weak.reasons.includes("weak_skill"));
  const due = rankReviewCandidate({ ...base, nextReviewAt:new Date("2026-01-01") }, new Date("2026-01-10"));
  assert.ok(due.reasons.includes("overdue"));
});

test("Pinyin syllable parser supports marks, numbers, neutral tone and ü", () => {
  assert.deepEqual(parsePinyinSyllables("xuéxí")?.map(item=>[item.base,item.tone]), [["xue",2],["xi",2]]);
  assert.deepEqual(parsePinyinSyllables("ni3 hao3")?.map(item=>[item.base,item.tone]), [["ni",3],["hao",3]]);
  assert.deepEqual(parsePinyinSyllables("xièxie")?.map(item=>[item.base,item.tone]), [["xie",4],["xie",0]]);
  assert.deepEqual(parsePinyinSyllables("lv4")?.map(item=>[item.base,item.tone]), [["lv",4]]);
  assert.equal(parsePinyinSyllables("xuexi"), null);
});

test("Tone Trainer grades per syllable and exposes canonical Pinyin", () => {
  const exercise=buildToneExercise("xue2xi2"); assert.equal(exercise.eligible,true);
  assert.equal(exercise.eligible&&exercise.canonical,"xuéxí");
  assert.deepEqual(gradeToneSelection("xuéxí",[3,2]),{correct:false,correctCount:1,total:2,exercise:buildToneExercise("xuéxí")});
  assert.equal(gradeToneSelection("xièxie",[4,0]).correct,true);
});

test("Sentence Cloze only blanks one exact target and preserves reveal context", () => {
  const set={languageCode:"zh-CN",languageSettings:'{"scriptVariant":"simplified"}'};
  const eligible=buildSentenceCloze({set,word:{term:"学习",example:"我每天学习中文。",examplePronunciation:"Wǒ měitiān xuéxí Zhōngwén.",exampleMeaning:"Tôi học tiếng Trung mỗi ngày."}});
  assert.equal(eligible.eligible,true); assert.equal(eligible.eligible&&eligible.prompt,"我每天____中文。");
  assert.equal(buildSentenceCloze({set,word:{term:"学习",example:"我喜欢中文。"}}).eligible,false);
  assert.equal(buildSentenceCloze({set,word:{term:"学习",example:"学习学习"}}).eligible,false);
});

test("adaptive learning architecture derives user identity server-side and keeps guest read-only", () => {
  const api=readFileSync("src/app/api/learning/mastery/route.ts","utf8");
  const fill=readFileSync("src/components/FillFocusSession.tsx","utf8");
  const guest=readFileSync("src/components/ShareGuestExperience.tsx","utf8");
  const migration=readFileSync("drizzle/0032_adaptive_learning.sql","utf8");
  const senses=readFileSync("src/lib/wordSenses.ts","utf8");
  const backup=readFileSync("src/lib/backup.ts","utf8");
  assert.match(api,/getSession\(\)/); assert.doesNotMatch(api,/body\.userId/);
  assert.match(fill,/pronunciation_recall/); assert.match(fill,/orthography_production/);
  assert.match(guest,/persist=\{false\}/);
  assert.match(migration,/ON DELETE CASCADE/); assert.match(migration,/user_word_skill_progress/); assert.match(migration,/word_senses/);
  assert.match(senses,/updateWordSense/); assert.match(senses,/isPrimary:\s*false/);
  assert.match(backup,/userWordSkillProgress/); assert.match(backup,/wordSenses/);
});
