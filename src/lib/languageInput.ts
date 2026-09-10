/**
 * Removes formatting characters commonly introduced by Excel, WPS and Google
 * Sheets while preserving visible language content. This is deliberately
 * shared by Hanzi and Pinyin grading so every learning surface behaves alike.
 */
export function sanitizeLearnerText(value: string | null | undefined) {
  return (value || "")
    .normalize("NFC")
    .replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, "")
    .replace(/[\u00A0\u202F\u3000]/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
