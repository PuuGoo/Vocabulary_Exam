export const SHARE_SLUG_MIN_LENGTH = 4;
export const SHARE_SLUG_MAX_LENGTH = 64;

export const RESERVED_SHARE_SLUGS = new Set([
  "admin", "api", "login", "logout", "register", "signup", "signin", "share", "shared", "s", "app",
  "settings", "account", "dashboard", "study", "learn", "quiz", "match", "review", "progress", "help",
  "support", "null", "undefined", "forgot-password", "reset-password", "assignments", "results",
]);

export type ShareSlugValidation = { valid: true; slug: string } | { valid: false; slug: string; reason: "too_short" | "too_long" | "invalid" | "reserved" };

export function normalizeShareSlug(value: string) {
  return value
    .replace(/[đĐ]/g, (character) => character === "Đ" ? "D" : "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, SHARE_SLUG_MAX_LENGTH)
    .replace(/-$/g, "");
}

export function validateShareSlug(value: string): ShareSlugValidation {
  const slug = normalizeShareSlug(value);
  if (slug.length < SHARE_SLUG_MIN_LENGTH) return { valid: false, slug, reason: "too_short" };
  if (value.trim().length > SHARE_SLUG_MAX_LENGTH || slug.length > SHARE_SLUG_MAX_LENGTH) return { valid: false, slug, reason: "too_long" };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return { valid: false, slug, reason: "invalid" };
  if (RESERVED_SHARE_SLUGS.has(slug)) return { valid: false, slug, reason: "reserved" };
  return { valid: true, slug };
}

export function shareSlugError(reason: Exclude<ShareSlugValidation, { valid: true }>["reason"]) {
  if (reason === "too_short") return "Liên kết phải có ít nhất 4 ký tự.";
  if (reason === "too_long") return "Liên kết không được dài quá 64 ký tự.";
  if (reason === "reserved") return "Tên liên kết này được Lexora dành riêng.";
  return "Chỉ sử dụng chữ thường, số và dấu gạch ngang.";
}

