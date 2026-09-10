import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { getAvailableModes, getLanguageConfig, getWordDisplayForms } from "./languages";
import { comparePinyin, normalizePinyinForSearch, numberedPinyinToToneMarks } from "./pinyin";
import { gradeLanguageAnswer, parseChineseCombinedAnswer, sanitizeLearnerText } from "./languageAnswer";

test("language registry preserves English and configures Mandarin",()=>{assert.equal(getLanguageConfig("en").ttsLanguage,"en-US");assert.equal(getLanguageConfig("zh-CN").recognitionLanguage,"zh-CN");assert.equal(getAvailableModes({type:"language_vocab",languageCode:"zh-CN"}).includes("sentence"),false);assert.equal(getAvailableModes({type:"ielts_vocab",languageCode:"en"}).includes("sentence"),true);});
test("Chinese display respects script settings",()=>{const word={term:"学习",alternateTerm:"學習"};assert.deepEqual(getWordDisplayForms(word,{languageCode:"zh-CN",languageSettings:'{"scriptVariant":"simplified"}'}),{primary:"学习",secondary:"學習"});assert.deepEqual(getWordDisplayForms(word,{languageCode:"zh-CN",languageSettings:'{"scriptVariant":"traditional"}'}),{primary:"學習",secondary:"学习"});});
test("strict Pinyin accepts marks and numbers but reports missing tones",()=>{assert.equal(comparePinyin("xuéxí","xuéxí","strict").correct,true);assert.equal(comparePinyin("xue2xi2","xuéxí","strict").correct,true);const miss=comparePinyin("xuexi","xuéxí","strict");assert.equal(miss.correct,false);assert.equal(miss.nearMiss,true);assert.equal(comparePinyin("xuexi","xuéxí","relaxed").correct,true);});
test("Pinyin normalizes ü, apostrophes, neutral tone and search",()=>{assert.equal(comparePinyin("lv4","lǜ","strict").correct,true);assert.equal(comparePinyin("lu:4","lǜ","strict").correct,true);assert.equal(comparePinyin("xi1'an1","Xī'ān","strict").correct,true);assert.equal(comparePinyin("ma5","ma","strict").correct,true);assert.equal(normalizePinyinForSearch("xuéxí"),"xuexi");});
test("Hanzi grading is exact and accepts configured both scripts",()=>{const set={languageCode:"zh-CN",languageSettings:'{"scriptVariant":"both","pinyinTonePolicy":"strict"}'};const word={term:"学习",alternateTerm:"學習",pronunciation:"xuéxí"};assert.equal(gradeLanguageAnswer({set,word,userAnswer:"学习"}).correct,true);assert.equal(gradeLanguageAnswer({set,word,userAnswer:"學習"}).correct,true);assert.equal(gradeLanguageAnswer({set,word,userAnswer:"学生"}).correct,false);assert.equal(gradeLanguageAnswer({set,word,target:"pronunciation",userAnswer:"xue2xi2"}).correct,true);});

test("numbered Pinyin converts to canonical tone marks",()=>{
  const cases: Record<string,string> = {
    "ni3 hao3":"nǐ hǎo", xue2xi2:"xuéxí", lao3shi1:"lǎoshī",
    Zhong1guo2:"Zhōngguó", lv4:"lǜ", "lu:4":"lǜ", nv3:"nǚ",
    shui3:"shuǐ", gui4:"guì", liu2:"liú", ou3:"ǒu", ma5:"ma",
  };
  for (const [input, expected] of Object.entries(cases)) assert.equal(numberedPinyinToToneMarks(input), expected, input);
});

test("learner input sanitation removes spreadsheet clipboard artifacts",()=>{
  assert.equal(sanitizeLearnerText("\uFEFF\u3000学习\u200B\r\n"), "学习");
  assert.equal(sanitizeLearnerText("\u00A0xuéxí\u202F\u2060"), "xuéxí");
  assert.equal(sanitizeLearnerText("Xī’an"), "Xī'an");
});

test("Chinese grading accepts valid clipboard forms but rejects contradictions",()=>{
  const set={languageCode:"zh-CN",languageSettings:'{"scriptVariant":"both","pinyinTonePolicy":"strict"}'};
  const word={term:"学习",alternateTerm:"學習",pronunciation:"xuéxí"};
  for (const answer of [" 学习 ","学习\r\n","学习\u200B","\u3000学习\u3000"]) assert.equal(gradeLanguageAnswer({set,word,target:"term",userAnswer:answer}).correct,true,answer);
  for (const answer of [" xuéxí ","xuéxí\r\n","xuéxí\u200B","xue2xi2","XUÉXÍ","xue\u0301xi\u0301"]) assert.equal(gradeLanguageAnswer({set,word,target:"pronunciation",userAnswer:answer}).correct,true,answer);
  assert.equal(gradeLanguageAnswer({set,word,target:"term",userAnswer:"学习\txuéxí"}).correct,true);
  assert.equal(gradeLanguageAnswer({set,word,target:"pronunciation",userAnswer:"学习\nxuéxí"}).correct,true);
  assert.equal(gradeLanguageAnswer({set,word,target:"term",userAnswer:"学习 xuésheng"}).correct,false);
  assert.equal(gradeLanguageAnswer({set,word,target:"pronunciation",userAnswer:"學生 xuéxí"}).correct,false);
  assert.equal(parseChineseCombinedAnswer("我喜欢学习中文").combined,false);
});

test("strict Pinyin distinguishes tones from spelling and supports compact syllables",()=>{
  assert.equal(comparePinyin("ni3hao3","nǐ hǎo","strict").correct,true);
  assert.equal(comparePinyin("ni2 hao3","nǐ hǎo","strict").reason,"missing_or_wrong_tone");
  assert.equal(comparePinyin("nai3 hao3","nǐ hǎo","strict").nearMiss,false);
  assert.equal(comparePinyin("xie4xie","xièxie","strict").correct,true);
  assert.equal(comparePinyin("lu4","lǜ","strict").correct,false);
});

test("Chinese Fill surfaces keep Hanzi and Pinyin as explicit separate targets",()=>{
  const focus=readFileSync("src/components/FillFocusSession.tsx","utf8");
  const quiz=readFileSync("src/app/(student)/quiz/[setId]/page.tsx","utf8");
  const study=readFileSync("src/app/(student)/study/page.tsx","utf8");
  const learn=readFileSync("src/components/learning/LearnExperience.tsx","utf8");
  assert.match(focus,/NHẬP \{target === "pronunciation"/);
  assert.match(quiz,/<ListFillInputs[\s\S]*target=\{fillTarget\}/);
  assert.match(quiz,/gradeLanguageAnswer\(\{set,word,target/);
  assert.match(study,/target=pronunciation&scope=unknown/);
  assert.match(quiz,/quizUrl\(\{ target: "pronunciation" \}\)/);
  assert.match(learn,/target=pronunciation/);
  assert.doesNotMatch(focus,/word\.term\s*\+\s*["' ]+\s*\+\s*word\.pronunciation/);
});
