import assert from "node:assert/strict";
import test from "node:test";
import {
  detectSheetKind, indexByTerm, indexByWordKey, parseAdvancedWordMeta, parseCollocationRows,
  parseFamilyRows, parsePatternRows, parseTopicRows, resolveLinkedWordId, splitMultiValueCell,
} from "./vocabImport";

test("the legacy simple format produces no advanced metadata", () => {
  assert.deepEqual(parseAdvancedWordMeta({ term: "abandon", meaning: "từ bỏ", example: "", wtype: "verb", ipa: "/əˈbæn.dən/" }), {});
});

test("advanced columns are validated instead of trusted", () => {
  const meta = parseAdvancedWordMeta({
    term: "considerable", register: "Academic", cefr: "c1", ielts: "yes", ieltsband: "7+",
    ieltsskills: "reading | writing", usagecontext: "academic;written", notes: "thường đi với increase",
    contentkind: "nonsense", contentstatus: "draft", frequency: "high",
  });
  assert.equal(meta.register, "academic");
  assert.equal(meta.cefrLevel, "C1");
  assert.equal(meta.ieltsRelevant, true);
  assert.equal(meta.ieltsBandRelevance, "7+");
  assert.deepEqual(meta.ieltsSkills, ["reading", "writing"]);
  assert.deepEqual(meta.usageContext, ["academic", "written"]);
  assert.equal(meta.notes, "thường đi với increase");
  assert.equal(meta.contentStatus, "draft");
  assert.equal(meta.frequency, "high");
  // Unknown enum values are dropped rather than stored as free text.
  assert.equal(meta.contentKind, undefined);
});

test("linked sheets are detected by name, data sheets stay separate", () => {
  assert.equal(detectSheetKind("Collocations"), "collocations");
  assert.equal(detectSheetKind("word families"), "wordfamilies");
  assert.equal(detectSheetKind("Patterns"), "patterns");
  assert.equal(detectSheetKind("Topics"), "topics");
  assert.equal(detectSheetKind("Words"), "words");
  assert.equal(detectSheetKind("Sheet1"), null);
});

test("collocation sheets keep one row per phrase and respect draft status", () => {
  const rows = parseCollocationRows([
    { wordkey: "w1", phrase: "make a decision", meaning: "đưa ra quyết định", example: "We need to make a decision." },
    { wordkey: "w1", phrase: "reach a decision", contentstatus: "draft" },
    { wordkey: "w2", phrase: "" },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].contentStatus, "approved");
  assert.equal(rows[0].example, "We need to make a decision.");
  assert.equal(rows[1].contentStatus, "draft");
});

test("pattern and family sheets keep authored structure", () => {
  const patterns = parsePatternRows([{ wordkey: "w3", pattern: "prevent sb from doing sth", meaning: "ngăn ai làm gì" }]);
  assert.equal(patterns[0].pattern, "prevent sb from doing sth");
  const families = parseFamilyRows([{ wordkey: "w4", term: "economic", family: "economy", relation: "adjective" }]);
  assert.deepEqual(families[0], { wordKey: "w4", term: "economic", family: "economy", relation: "adjective" });
});

test("topic cells accept multiple values with the documented separator", () => {
  assert.deepEqual(splitMultiValueCell("Education | Environment"), ["Education", "Environment"]);
  assert.deepEqual(splitMultiValueCell("Education;Environment"), ["Education", "Environment"]);
  const rows = parseTopicRows([{ wordkey: "w5", topic: "Education | Technology" }]);
  assert.deepEqual(rows.map((row) => row.topic), ["Education", "Technology"]);
});

test("linking prefers a stable wordKey and falls back to term, never to row order", () => {
  const wordRows = [{ wordkey: "K1", term: "decision" }, { wordkey: "K2", term: "threat" }];
  const byWordKey = indexByWordKey(wordRows, [101, 102]);
  const byTerm = indexByTerm([{ id: 101, term: "decision" }, { id: 102, term: "threat" }]);
  assert.equal(resolveLinkedWordId({ wordKey: "k2", term: "decision" }, byWordKey, byTerm), 102);
  assert.equal(resolveLinkedWordId({ wordKey: "", term: "Threat" }, byWordKey, byTerm), 102);
  assert.equal(resolveLinkedWordId({ wordKey: "missing", term: "unknown" }, byWordKey, byTerm), null);
  assert.equal(resolveLinkedWordId({ wordKey: "", term: "" }, byWordKey, byTerm), null);
});
