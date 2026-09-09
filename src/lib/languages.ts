import { getChineseSettings } from "@/lib/languageSettings";

export const SUPPORTED_LANGUAGE_CODES = ["en", "zh-CN"] as const;
export type SupportedLanguageCode = (typeof SUPPORTED_LANGUAGE_CODES)[number];
export type LearningMode = "learn" | "fill" | "mc" | "match" | "dictation" | "listen" | "pronunciation" | "sentence" | "timed";
export type FillTarget = "term" | "pronunciation";
export type LanguageConfig = { code: SupportedLanguageCode; label: string; nativeLabel: string; badge: string; termLabel: string; pronunciationLabel: string; meaningLabel: string; ttsLanguage: string; recognitionLanguage: string; fillTermLabel: string; fillUnknownLabel: string; supportedModes: readonly LearningMode[] };
const COMMON: readonly LearningMode[] = ["learn", "fill", "mc", "match", "dictation", "listen", "pronunciation", "timed"];
export const LANGUAGE_REGISTRY: Record<SupportedLanguageCode, LanguageConfig> = {
  en: { code:"en", label:"Tiếng Anh", nativeLabel:"English", badge:"EN", termLabel:"Từ / cụm từ tiếng Anh", pronunciationLabel:"IPA", meaningLabel:"Nghĩa tiếng Việt", ttsLanguage:"en-US", recognitionLanguage:"en-US", fillTermLabel:"Điền từ tiếng Anh", fillUnknownLabel:"Điền từ chưa nhớ", supportedModes:[...COMMON,"sentence"] },
  "zh-CN": { code:"zh-CN", label:"Tiếng Trung", nativeLabel:"中文", badge:"中文", termLabel:"Chữ Hán", pronunciationLabel:"Pinyin", meaningLabel:"Nghĩa tiếng Việt", ttsLanguage:"zh-CN", recognitionLanguage:"zh-CN", fillTermLabel:"Điền chữ Hán", fillUnknownLabel:"Điền chữ Hán chưa nhớ", supportedModes:COMMON },
};
export function isSupportedLanguageCode(value: unknown): value is SupportedLanguageCode { return typeof value === "string" && (SUPPORTED_LANGUAGE_CODES as readonly string[]).includes(value); }
export function normalizeLanguageCode(value: unknown): SupportedLanguageCode { return value === "zh" || value === "zh-cn" || value === "zh-CN" ? "zh-CN" : "en"; }
export function getLanguageConfig(value: unknown) { return LANGUAGE_REGISTRY[normalizeLanguageCode(value)]; }
export function getAvailableModes(set: { type?: string | null; languageCode?: string | null }) { return set.type === "irregular_verb" ? (["learn","fill","mc","match","dictation","listen","pronunciation","timed"] as const) : getLanguageConfig(set.languageCode).supportedModes; }
export function getFillModeLabel(set: { type?: string | null; languageCode?: string | null }, target: FillTarget = "term") { if (set.type === "irregular_verb") return "Điền V1/V2/V3"; const config=getLanguageConfig(set.languageCode); return target === "pronunciation" ? `Điền ${config.pronunciationLabel}` : config.fillTermLabel; }
export function getFillUnknownLabel(set: { type?: string | null; languageCode?: string | null }) { return set.type === "irregular_verb" ? "Điền V1/V2/V3 chưa nhớ" : getLanguageConfig(set.languageCode).fillUnknownLabel; }
export type LanguageWord = { term?:string|null; alternateTerm?:string|null; pronunciation?:string|null; ipa?:string|null; v1?:string|null };
export function getWordPronunciation(word: LanguageWord, set: {languageCode?:string|null}) { return normalizeLanguageCode(set.languageCode)==="zh-CN" ? word.pronunciation||"" : word.ipa||""; }
export function getWordDisplayForms(word: LanguageWord, set: {languageCode?:string|null;languageSettings?:unknown}) { if(normalizeLanguageCode(set.languageCode)!=="zh-CN") return {primary:word.term||"",secondary:""}; const settings=getChineseSettings(set); if(settings.scriptVariant==="traditional") return {primary:word.alternateTerm||word.term||"",secondary:word.alternateTerm?word.term||"":""}; return {primary:word.term||word.alternateTerm||"",secondary:word.alternateTerm&&word.alternateTerm!==word.term?word.alternateTerm:""}; }
export function getSpeakText(word: LanguageWord, set: {type?:string|null;languageCode?:string|null;languageSettings?:unknown}) { if(set.type==="irregular_verb") return (word.v1||"").split("/")[0].trim(); const value=getWordDisplayForms(word,set).primary; return normalizeLanguageCode(set.languageCode)==="en"?value.split("/")[0].trim():value; }
