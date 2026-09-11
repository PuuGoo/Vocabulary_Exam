import { sanitizeLearnerText } from "./languageInput";

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

export type PinyinSyllable = { base: string; tone: 0 | 1 | 2 | 3 | 4; display: string };

const SYLLABLE_FINALS = new Set([
  "a","ai","an","ang","ao","e","ei","en","eng","er","o","ong","ou",
  "i","ia","ian","iang","iao","ie","in","ing","iong","iu",
  "u","ua","uai","uan","uang","ue","ui","un","uo","v","ve","van","vn",
]);
const INITIALS = ["zh","ch","sh","b","p","m","f","d","t","n","l","g","k","h","j","q","x","r","z","c","s","y","w",""];
const ACCENT_TONE: Record<string, 1 | 2 | 3 | 4> = {
  ā:1,á:2,ǎ:3,à:4,ē:1,é:2,ě:3,è:4,ī:1,í:2,ǐ:3,ì:4,
  ō:1,ó:2,ǒ:3,ò:4,ū:1,ú:2,ǔ:3,ù:4,ǖ:1,ǘ:2,ǚ:3,ǜ:4,
  ń:2,ň:3,ǹ:4,ḿ:2,
};

function syllableBase(display: string) {
  return normalizePinyin(display).base.replace(/[']/g, "");
}

function isPinyinSyllable(base: string) {
  return INITIALS.some((initial) => base.startsWith(initial) && SYLLABLE_FINALS.has(base.slice(initial.length)));
}

function toneOf(display: string): 0 | 1 | 2 | 3 | 4 {
  for (const character of display.toLocaleLowerCase("en").normalize("NFC")) {
    if (ACCENT_TONE[character]) return ACCENT_TONE[character];
  }
  const numeric = display.match(/[1-5]/)?.[0];
  return numeric && numeric !== "5" ? Number(numeric) as 1 | 2 | 3 | 4 : 0;
}

function splitContinuousPinyin(display: string): string[] | null {
  const characters = [...display.normalize("NFC")];
  const candidates: string[][] = [];
  function visit(offset: number, parts: string[]) {
    if (candidates.length > 20) return;
    if (offset === characters.length) { candidates.push(parts); return; }
    for (let end = offset + 1; end <= characters.length; end++) {
      const part = characters.slice(offset, end).join("");
      if (isPinyinSyllable(syllableBase(part))) visit(end, [...parts, part]);
    }
  }
  visit(0, []);
  if (!candidates.length) return null;
  const toned = candidates.filter((candidate) => candidate.every((part) => {
    const marks = [...part.toLocaleLowerCase("en")].filter((character) => ACCENT_TONE[character]).length;
    return marks <= 1;
  }));
  const ranked = (toned.length ? toned : candidates).sort((a, b) => {
    const aEvidence = a.filter((part) => toneOf(part) > 0).length;
    const bEvidence = b.filter((part) => toneOf(part) > 0).length;
    return bEvidence - aEvidence || a.length - b.length;
  });
  if (ranked.length > 1 && ranked[0].length !== ranked[1].length && ranked[0].every((part) => toneOf(part) === 0)) return null;
  return ranked[0];
}

/** Parse stored Pinyin into tone-bearing syllables. Ambiguous toneless strings
 * are deliberately ineligible instead of producing a misleading exercise. */
export function parsePinyinSyllables(input: string | null | undefined): PinyinSyllable[] | null {
  const display = canonicalizePinyinDisplay(input).trim();
  if (!display) return null;
  const explicitParts = display.split(/[\s'’]+/).filter(Boolean);
  const parts: string[] = [];
  for (const explicit of explicitParts) {
    const split = splitContinuousPinyin(explicit.replace(/[1-5]/g, ""));
    if (!split) return null;
    parts.push(...split);
  }
  const tonesFromNumbers = [...sanitizeLearnerText(input).matchAll(/([1-5])/g)].map((match) => match[1] === "5" ? 0 : Number(match[1]));
  const result = parts.map((part, index) => ({
    base: syllableBase(part),
    tone: (tonesFromNumbers[index] ?? toneOf(part)) as 0 | 1 | 2 | 3 | 4,
    display: part,
  }));
  if (!result.length || result.every((item) => item.tone === 0) && !hasExplicitPinyinTone(input)) return null;
  return result;
}
