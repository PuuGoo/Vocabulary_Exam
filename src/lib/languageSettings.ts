import { z } from "zod";

export const chineseSettingsSchema = z.object({
  scriptVariant: z.enum(["simplified", "traditional", "both"]).default("simplified"),
  pronunciationScheme: z.literal("pinyin").default("pinyin"),
  pinyinTonePolicy: z.enum(["strict", "relaxed"]).default("strict"),
});
export type ChineseLanguageSettings = z.infer<typeof chineseSettingsSchema>;
export const DEFAULT_CHINESE_SETTINGS: ChineseLanguageSettings = { scriptVariant: "simplified", pronunciationScheme: "pinyin", pinyinTonePolicy: "strict" };

export function parseLanguageSettings(input: unknown, languageCode?: string): ChineseLanguageSettings | Record<string, never> {
  let value = input;
  if (typeof input === "string") { try { value = JSON.parse(input || "{}"); } catch { value = {}; } }
  if (languageCode === "zh-CN") {
    const parsed = chineseSettingsSchema.safeParse(value || {});
    return parsed.success ? parsed.data : DEFAULT_CHINESE_SETTINGS;
  }
  return {};
}
export function serializeLanguageSettings(input: unknown, languageCode: string) {
  return languageCode === "zh-CN" ? JSON.stringify(chineseSettingsSchema.parse(input || {})) : "{}";
}
export function getChineseSettings(set: { languageCode?: string | null; languageSettings?: unknown }): ChineseLanguageSettings {
  return parseLanguageSettings(set.languageSettings, set.languageCode || "en") as ChineseLanguageSettings;
}
