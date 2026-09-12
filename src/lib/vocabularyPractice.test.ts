import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClozeEligibility, buildClozeItem, buildCollocationItems, buildPatternFrame, buildPatternItems,
  buildVocabularyItems, buildVocabularySession, describeBlocks, gradeVocabularyItem, interleaveItems,
  patternSourcesFromWordType, splitPatternVariants,
} from "./vocabularyPractice";

const decision = { id: 1, term: "decision", meaning: "quyết định", example: "We need a decision soon.", wtype: "noun" };
const abandon = { id: 2, term: "abandon", meaning: "từ bỏ", example: "They had to abandon the project.", wtype: "verb" };

test("collocation blanks the head word and grades the authored answer only", () => {
  const [item] = buildCollocationItems(decision, [{ id: 11, phrase: "make a decision", meaning: "đưa ra quyết định" }])
    .filter((candidate) => candidate.task === "blank");
  assert.equal(item.prompt, "make a ______");
  assert.equal(item.answerKey, "decision");
  assert.equal(gradeVocabularyItem(item, "decision").correct, true);
  assert.equal(gradeVocabularyItem(item, " decisions ").correct, false);
  assert.equal(gradeVocabularyItem(item, "choice").correct, false);
});

test("collocation recall accepts the whole authored phrase and rejects wrong collocations", () => {
  const [item] = buildCollocationItems(decision, [{ id: 11, phrase: "make a decision", meaning: "đưa ra quyết định" }])
    .filter((candidate) => candidate.task === "phrase");
  assert.equal(item.prompt, "đưa ra quyết định");
  assert.equal(gradeVocabularyItem(item, "make a decision").correct, true);
  assert.equal(gradeVocabularyItem(item, "do a decision").correct, false);
  assert.equal(gradeVocabularyItem(item, "do a decision").reason, "wrong_collocation");
  assert.equal(gradeVocabularyItem(item, "do a decision").canonical, "make a decision");
});

test("equally valid alternatives stay valid when the data lists both", () => {
  const threat = { id: 3, term: "threat", meaning: "mối đe doạ" };
  const [item] = buildCollocationItems(threat, [{ id: 12, phrase: "pose a threat / pose a risk", meaning: "gây ra rủi ro" }])
    .filter((candidate) => candidate.task === "phrase");
  assert.equal(gradeVocabularyItem(item, "pose a threat").correct, true);
  assert.equal(gradeVocabularyItem(item, "pose a risk").correct, true);
  assert.equal(gradeVocabularyItem(item, "pose a danger").correct, false);
});

test("head-word blanking wins, and lexical fallback covers phrases without a literal match", () => {
  const [head] = buildCollocationItems(decision, [{ id: 13, phrase: "difficult decision" }])
    .filter((candidate) => candidate.task === "blank");
  assert.equal(head.prompt, "difficult ______");
  assert.equal(head.answerKey, "decision");

  const [fallback] = buildCollocationItems(decision, [{ id: 14, phrase: "decision-making process" }])
    .filter((candidate) => candidate.task === "blank");
  assert.equal(fallback.prompt, "______ process");
  assert.equal(fallback.answerKey, "decision-making");
});

test("context cloze reuses the authored example and keeps punctuation intact", () => {
  const item = buildClozeItem(abandon)!;
  assert.equal(item.prompt, "They had to ______ the project.");
  assert.equal(gradeVocabularyItem(item, "abandon").correct, true);
  assert.equal(gradeVocabularyItem(item, "abandoned").correct, false);
  assert.equal(gradeVocabularyItem(item, "abandon").reason, "wrong_context");

  const punctuated = buildClozeEligibility({ term: "rain", example: "Despite the rain, they continued." });
  assert.equal(punctuated.eligible, true);
  assert.equal(punctuated.eligible && punctuated.prompt, "Despite the ______, they continued.");
});

test("cloze is skipped when the data cannot support an unambiguous blank", () => {
  assert.equal(buildClozeItem({ id: 4, term: "abandon", meaning: "từ bỏ" }), null);
  assert.equal(buildClozeEligibility({ term: "abandon", example: "" }).eligible, false);
  assert.equal(buildClozeEligibility({ term: "rain", example: "The <b>rain</b> fell." }).eligible, false);
  assert.equal(buildClozeEligibility({ term: "abandon", example: "They had abandoned the project." }).eligible, false);
  assert.equal(buildClozeEligibility({ term: "abandon", example: "abandon" }).eligible, false);
  const capitalised = buildClozeEligibility({ term: "abandon", example: "Abandon hope, they said." });
  assert.equal(capitalised.eligible, true);
  assert.equal(capitalised.eligible && capitalised.prompt, "______ hope, they said.");
  assert.equal(capitalised.eligible && capitalised.capitalized, true);
});

test("cloze keeps every accepted spelling of the target", () => {
  const item = buildClozeItem({ id: 5, term: "burned / burnt", meaning: "bị cháy", example: "The toast was burned this morning." })!;
  assert.equal(item.prompt, "The toast was ______ this morning.");
  assert.equal(gradeVocabularyItem(item, "burned").correct, true);
  assert.equal(gradeVocabularyItem(item, "burnt").correct, true);
});

test("pattern frames test the preposition, gerund or infinitive marker only", () => {
  assert.deepEqual(buildPatternFrame("be responsible for sth"), { prompt: "be responsible ______ sth", answer: "for", hint: "Giới từ" });
  assert.deepEqual(buildPatternFrame("prevent sb from doing sth")?.answer, "from");
  assert.deepEqual(buildPatternFrame("have difficulty doing sth"), { prompt: "have difficulty ______ sth", answer: "doing", hint: "Danh động từ" });
  assert.equal(buildPatternFrame("decision"), null);
  assert.equal(buildPatternFrame("noun"), null);
});

test("pattern recall grades the authored structure exactly", () => {
  const prevent = { id: 6, term: "prevent", meaning: "ngăn cản" };
  const items = buildPatternItems(prevent, [{ id: 21, pattern: "prevent sb from doing sth", meaning: "ngăn ai làm gì" }]);
  const recall = items.find((item) => item.task === "recall")!;
  assert.equal(recall.prompt, "ngăn ai làm gì");
  assert.equal(gradeVocabularyItem(recall, "prevent sb from doing sth").correct, true);
  assert.equal(gradeVocabularyItem(recall, "prevent sb to do sth").correct, false);
  assert.equal(gradeVocabularyItem(recall, "prevent sb to do sth").reason, "wrong_pattern");
  assert.equal(items.some((item) => item.task === "frame" && item.answerKey === "from"), true);
});

test("existing multi-group wtype patterns stay usable without new data", () => {
  const sources = patternSourcesFromWordType("sth/sb frustrates sb; sb is frustrated with sth/sb");
  assert.equal(sources.length, 1);
  assert.deepEqual(splitPatternVariants(sources[0].pattern), ["sth/sb frustrates sb", "sb is frustrated with sth/sb"]);
  const frustrated = { id: 7, term: "frustrated", meaning: "bực bội", wtype: "sth/sb frustrates sb; sb is frustrated with sth/sb" };
  const items = buildPatternItems(frustrated, []);
  const frames = items.filter((item) => item.task === "frame");
  assert.equal(frames.length, 1);
  assert.equal(frames[0].answerKey, "with");
  assert.equal(items.filter((item) => item.task === "recall").length, 2);
  assert.deepEqual(patternSourcesFromWordType("noun"), []);
});

test("sessions interleave dimensions instead of repeating one four times", () => {
  const words = [decision, abandon, { id: 8, term: "threat", meaning: "mối đe doạ", example: "The threat grew quickly." }];
  const items = buildVocabularyItems({
    words,
    collocationsByWordId: new Map([
      [1, [{ id: 11, phrase: "make a decision", meaning: "đưa ra quyết định" }, { id: 12, phrase: "reach a decision" }]],
      [8, [{ id: 13, phrase: "pose a threat", meaning: "gây đe doạ" }]],
    ]),
    patternsByWordId: new Map([[2, [{ id: 21, pattern: "abandon doing sth", meaning: "từ bỏ việc gì" }]]]),
  });
  const session = buildVocabularySession(items);
  assert.ok(session.items.length >= 6);
  let longestRun = 1;
  let run = 1;
  for (let index = 1; index < session.items.length; index += 1) {
    run = session.items[index].kind === session.items[index - 1].kind ? run + 1 : 1;
    longestRun = Math.max(longestRun, run);
  }
  assert.ok(longestRun <= 2, `expected interleaved kinds, got a run of ${longestRun}`);
  assert.equal(describeBlocks(session.items).reduce((sum, block) => sum + block.count, 0), session.items.length);
  assert.equal(interleaveItems([]).length, 0);
});

test("session limit keeps the strongest mix within the daily budget", () => {
  const items = buildVocabularyItems({
    words: [decision, abandon],
    collocationsByWordId: new Map([[1, [{ id: 11, phrase: "make a decision", meaning: "đưa ra quyết định" }]]]),
  });
  assert.equal(buildVocabularySession(items, 2).items.length, 2);
  assert.equal(buildVocabularySession(items, 0).items.length, items.length);
});
