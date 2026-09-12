import {
  cefrLevelEnum, contentKindEnum, contentStatusEnum, ieltsSkillEnum, registerEnum, usageContextEnum,
  type CefrLevel, type ContentKind, type ContentStatus, type IeltsSkill, type UsageContext, type WordRegister,
} from "@/db/schema";

/**
 * Language-neutral vocabulary metadata helpers. Every field is optional and
 * admin-curated: unknown or blank input is dropped instead of guessed, so an
 * AI suggestion can never silently become canonical data.
 */

function pickEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase() as T;
  return allowed.includes(normalized) ? normalized : null;
}

export function normalizeContentKind(value: unknown): ContentKind | null {
  return pickEnum(value, contentKindEnum);
}

export function normalizeContentStatus(value: unknown): ContentStatus | null {
  return pickEnum(value, contentStatusEnum);
}

export function normalizeRegister(value: unknown): WordRegister | null {
  return pickEnum(value, registerEnum);
}

export function normalizeCefrLevel(value: unknown): CefrLevel | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase() as CefrLevel;
  return cefrLevelEnum.includes(normalized) ? normalized : null;
}

export function parseListColumn<T extends string>(raw: string | null | undefined, allowed: readonly T[]): T[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Tolerate the documented plain-text separator used by imports/exports.
    parsed = raw.split(/[|;,]/);
  }
  if (!Array.isArray(parsed)) return [];
  const values = parsed
    .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
    .filter(Boolean) as T[];
  return [...new Set(values.filter((item) => allowed.includes(item)))];
}

export function parseIeltsSkills(raw: string | null | undefined): IeltsSkill[] {
  return parseListColumn(raw, ieltsSkillEnum);
}

export function parseUsageContext(raw: string | null | undefined): UsageContext[] {
  return parseListColumn(raw, usageContextEnum);
}

export function stringifyListColumn(values: readonly string[]): string {
  return JSON.stringify([...new Set(values.map((value) => value.trim()).filter(Boolean))]);
}

/** Documented separator for multi-value cells in Excel/CSV import and export. */
export const LIST_CELL_SEPARATOR = "|";

export function splitListCell(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.split(/[|;]/).map((item) => item.trim()).filter(Boolean);
}

export function joinListCell(values: readonly string[]): string {
  return values.join(` ${LIST_CELL_SEPARATOR} `);
}

export const REGISTER_LABELS: Record<WordRegister, string> = {
  formal: "Trang trọng",
  neutral: "Trung tính",
  informal: "Thân mật",
  academic: "Học thuật",
  spoken: "Văn nói",
};

export const USAGE_CONTEXT_LABELS: Record<UsageContext, string> = {
  academic: "Học thuật",
  general: "Tổng quát",
  spoken: "Nói",
  written: "Viết",
};

export const IELTS_SKILL_LABELS: Record<IeltsSkill, string> = {
  listening: "Listening",
  reading: "Reading",
  speaking: "Speaking",
  writing: "Writing",
};

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  draft: "Bản nháp",
  reviewed: "Đã soát",
  approved: "Đã duyệt",
};

/** Only approved content is ever served to learners or shared guests. */
export function isPublishedStatus(status: string | null | undefined): boolean {
  return !status || status === "approved" || status === "reviewed";
}
