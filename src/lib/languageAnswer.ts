import { gradeFillAnswer, normalizeFillAnswer } from "@/lib/fillAnswer";
import { getChineseSettings } from "@/lib/languageSettings";
import { normalizeLanguageCode, type FillTarget } from "@/lib/languages";
import { comparePinyin } from "@/lib/pinyin";
import { sanitizeLearnerText } from "@/lib/languageInput";
export { sanitizeLearnerText } from "@/lib/languageInput";
export type LanguageAnswerReason="missing_or_wrong_tone"|"wrong_hanzi"|"wrong_pinyin"|"incomplete"|"contradictory_combined_answer";
export type LanguageAnswerGrade={correct:boolean;nearMiss:boolean;reason?:LanguageAnswerReason;acceptedAnswers:string[];canonicalDisplayAnswer?:string};
export function normalizeHanzi(value:string|null|undefined){return sanitizeLearnerText(value).replace(/[。！？!?]+$/u,"");}
export type ParsedChineseAnswer={combined:false;raw:string}|{combined:true;raw:string;term:string;pronunciation:string};
export function parseChineseCombinedAnswer(value:string|null|undefined):ParsedChineseAnswer {
  const raw=sanitizeLearnerText(value);
  const match=raw.match(/^([\p{Script=Han}]+)\s+([A-Za-zÀ-ÖØ-öø-ÿĀ-žǍ-ǜḿńňǹüÜvV0-5:' -]+)$/u);
  return match ? {combined:true,raw,term:match[1],pronunciation:match[2].trim()} : {combined:false,raw};
}
export function getTargetAcceptedAnswers(input:{set:{languageCode?:string|null;languageSettings?:unknown};word:{term?:string|null;alternateTerm?:string|null;pronunciation?:string|null};target?:FillTarget}){const target=input.target||"term";if(target==="pronunciation")return input.word.pronunciation?[input.word.pronunciation]:[];if(normalizeLanguageCode(input.set.languageCode)!=="zh-CN")return input.word.term?[input.word.term]:[];const settings=getChineseSettings(input.set);if(settings.scriptVariant==="traditional")return[input.word.alternateTerm||input.word.term||""].filter(Boolean);if(settings.scriptVariant==="both")return[...new Set([input.word.term,input.word.alternateTerm].filter((v):v is string=>Boolean(v)))];return[input.word.term||input.word.alternateTerm||""].filter(Boolean);}
export function gradeLanguageAnswer(input:{set:{languageCode?:string|null;languageSettings?:unknown};word:{term?:string|null;alternateTerm?:string|null;pronunciation?:string|null};target?:FillTarget;userAnswer:string}):LanguageAnswerGrade{
  const language=normalizeLanguageCode(input.set.languageCode),target=input.target||"term",acceptedAnswers=getTargetAcceptedAnswers(input);
  if(language==="en"&&target==="term")return gradeFillAnswer(input.userAnswer,input.word.term);
  const parsed=language==="zh-CN"?parseChineseCombinedAnswer(input.userAnswer):{combined:false as const,raw:sanitizeLearnerText(input.userAnswer)};
  const settings=getChineseSettings(input.set);
  const acceptedTerms=getTargetAcceptedAnswers({...input,target:"term"});
  const termValue=parsed.combined?parsed.term:parsed.raw;
  const pinyinValue=parsed.combined?parsed.pronunciation:parsed.raw;
  const termCorrect=Boolean(normalizeHanzi(termValue))&&acceptedTerms.some(answer=>normalizeHanzi(answer)===normalizeHanzi(termValue));
  const pinyinGrades=(input.word.pronunciation?[input.word.pronunciation]:[]).map(answer=>comparePinyin(pinyinValue,answer,settings.pinyinTonePolicy));
  const pinyinCorrect=pinyinGrades.some(grade=>grade.correct);
  if(parsed.combined){
    const toneNearMiss=termCorrect&&pinyinGrades.some(grade=>grade.nearMiss);
    if(!termCorrect||!pinyinCorrect)return{correct:false,nearMiss:toneNearMiss,reason:toneNearMiss?"missing_or_wrong_tone":"contradictory_combined_answer",acceptedAnswers,canonicalDisplayAnswer:acceptedAnswers[0]};
    return{correct:true,nearMiss:false,acceptedAnswers,canonicalDisplayAnswer:acceptedAnswers[0]};
  }
  if(language==="zh-CN"&&target==="pronunciation")return{correct:pinyinCorrect,nearMiss:pinyinGrades.some(g=>g.nearMiss),reason:pinyinGrades.some(g=>g.nearMiss)?"missing_or_wrong_tone":"wrong_pinyin",acceptedAnswers,canonicalDisplayAnswer:acceptedAnswers[0]};
  return{correct:termCorrect,nearMiss:false,reason:termCorrect?undefined:"wrong_hanzi",acceptedAnswers,canonicalDisplayAnswer:acceptedAnswers[0]};
}
export function normalizeLanguageSearch(value:string|null|undefined){return normalizeFillAnswer(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d");}
