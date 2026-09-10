import { sanitizeLearnerText } from "@/lib/languageInput";

const MARKS: Record<string, [string, string]> = {
  ā:["a","1"], á:["a","2"], ǎ:["a","3"], à:["a","4"],
  ē:["e","1"], é:["e","2"], ě:["e","3"], è:["e","4"],
  ī:["i","1"], í:["i","2"], ǐ:["i","3"], ì:["i","4"],
  ō:["o","1"], ó:["o","2"], ǒ:["o","3"], ò:["o","4"],
  ū:["u","1"], ú:["u","2"], ǔ:["u","3"], ù:["u","4"],
  ǖ:["v","1"], ǘ:["v","2"], ǚ:["v","3"], ǜ:["v","4"],
  ü:["v",""], ń:["n","2"], ň:["n","3"], ǹ:["n","4"], ḿ:["m","2"],
};

const TONE_MARKS: Record<string, readonly string[]> = {
  a: ["a", "ā", "á", "ǎ", "à"], e: ["e", "ē", "é", "ě", "è"],
  i: ["i", "ī", "í", "ǐ", "ì"], o: ["o", "ō", "ó", "ǒ", "ò"],
  u: ["u", "ū", "ú", "ǔ", "ù"], v: ["ü", "ǖ", "ǘ", "ǚ", "ǜ"],
};

function markSyllable(rawSyllable: string, tone: number) {
  const syllable = rawSyllable.replace(/u:/gi, "v");
  if (tone === 5 || tone === 0) return syllable.replace(/v/gi, (v) => v === "V" ? "Ü" : "ü");
  const lower = syllable.toLocaleLowerCase("en");
  let index = lower.indexOf("a");
  if (index < 0) index = lower.indexOf("e");
  if (index < 0 && lower.includes("ou")) index = lower.indexOf("o");
  if (index < 0) {
    for (let cursor = lower.length - 1; cursor >= 0; cursor--) {
      if ("iouv".includes(lower[cursor])) { index = cursor; break; }
    }
  }
  if (index < 0) return syllable;
  const vowel = lower[index] === "ü" ? "v" : lower[index];
  const marked = TONE_MARKS[vowel]?.[tone] || syllable[index];
  const display = syllable[index] === syllable[index].toUpperCase() ? marked.toUpperCase() : marked;
  return `${syllable.slice(0,index)}${display}${syllable.slice(index+1)}`.replace(/v/gi, (v) => v === "V" ? "Ü" : "ü");
}

/** Convert explicit tone numbers without ever guessing a missing tone. */
export function numberedPinyinToToneMarks(input: string | null | undefined) {
  return sanitizeLearnerText(input).replace(/([A-Za-züÜvV:]+)([1-5])/g, (_, syllable: string, tone: string) => markSyllable(syllable, Number(tone)));
}

export function canonicalizePinyinDisplay(input: string | null | undefined) {
  return numberedPinyinToToneMarks(input).normalize("NFC");
}

export type NormalizedPinyin={base:string;tones:string;comparable:string};
export function normalizePinyin(input:string|null|undefined):NormalizedPinyin {
  const raw=canonicalizePinyinDisplay(input).toLocaleLowerCase("en").replace(/u:/g,"v").replace(/ü/g,"v");
  let base="",tones="";
  for(const c of raw){const mark=MARKS[c];if(mark){base+=mark[0];tones+=mark[1];continue;}if(/[1-5]/.test(c)){if(c!=="5")tones+=c;continue;}base+=c;}
  // Spaces are presentation-only in Pinyin. Apostrophes remain meaningful
  // syllable boundaries and are therefore retained.
  base=base.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g,"").trim();
  return {base,tones,comparable:`${base}|${tones}`};
}
export function comparePinyin(input:string,expected:string,tonePolicy:"strict"|"relaxed"="strict"){const actual=normalizePinyin(input),target=normalizePinyin(expected);const syllablesCorrect=Boolean(actual.base)&&actual.base===target.base;const tonesCorrect=actual.tones===target.tones;return {correct:syllablesCorrect&&(tonePolicy==="relaxed"||tonesCorrect),nearMiss:syllablesCorrect&&!tonesCorrect,reason:syllablesCorrect&&!tonesCorrect?"missing_or_wrong_tone" as const:undefined,normalizedInput:actual,normalizedExpected:target};}
export function normalizePinyinForSearch(input:string|null|undefined){return normalizePinyin(input).base.replace(/'/g,"");}

export function hasExplicitPinyinTone(input: string | null | undefined) {
  const value = sanitizeLearnerText(input);
  return /[1-5āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜńňǹḿ]/i.test(value);
}
