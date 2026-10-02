/**
 * Public site configuration.
 *
 * Google Cloud Console (OAuth consent screen → App information) requires a
 * real, publicly reachable Application home page, Privacy policy link and
 * Terms of service link. These values must match the deployed domain exactly.
 *
 * PLACEHOLDER CONTACT: `contactEmail` is intentionally left empty. It is
 * rendered as a neutral instruction instead of a fabricated address. Set
 * SUPPORT_CONTACT_EMAIL (or edit this file) before requesting Google OAuth
 * verification, because Google asks for a monitored contact address.
 */
export const SITE_CONFIG = {
  name: "Lexora",
  legalName: "Lexora",
  tagline: "Học viện IELTS",
  title: "Lexora — Vocabulary Learning Platform",
  description:
    "Lexora là nền tảng học từ vựng cho IELTS và tiếng Trung: flashcard, lặp lại ngắt quãng, quiz và đồng bộ Google Sheets cho giáo viên.",
  homeUrl: "https://vocabulary-exam.vercel.app",
  privacyUrl: "https://vocabulary-exam.vercel.app/privacy",
  termsUrl: "https://vocabulary-exam.vercel.app/terms",
  loginUrl: "https://vocabulary-exam.vercel.app/login",
  registerUrl: "https://vocabulary-exam.vercel.app/register",
  /**
   * Monitored contact address for privacy/security requests.
   *
   * Empty by default on purpose: we never invent a legal or support mailbox
   * (an empty value means the contact section renders a neutral instruction
   * instead of a fabricated address). Set the real address here — or deploy
   * with SUPPORT_CONTACT_EMAIL set — before submitting the app for Google
   * OAuth verification, because Google asks for a monitored contact address.
   */
  contactEmail: "",
  effectiveDate: "2026-10-02",
} as const;

export const PUBLIC_ROUTES = ["/", "/privacy", "/terms"] as const;

export function publicSiteUrl(path: "/" | "/privacy" | "/terms"): string {
  return `${SITE_CONFIG.homeUrl}${path}`;
}

/** Contact block shared by the policy pages; honest about a missing address. */
export const CONTACT_SECTION = {
  heading: "Liên hệ",
  body:
    "Nếu bạn cần yêu cầu về dữ liệu cá nhân, quyền riêng tư hoặc báo lỗi bảo mật, vui lòng liên hệ quản trị viên của hệ thống Lexora mà bạn đang sử dụng. Nếu bạn không biết ai quản trị hệ thống, hãy dùng kênh liên hệ mà bạn đã đăng ký tài khoản.",
} as const;