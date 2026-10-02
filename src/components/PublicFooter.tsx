import Link from "next/link";
import { SITE_CONFIG } from "@/lib/siteConfig";

/**
 * Shared footer for the public pages. Rendered on the server (no client JS),
 * so the policy text and its navigation are readable without a session and
 * without JavaScript.
 */
export default function PublicFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-white">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-10 sm:px-8 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-gold text-base font-extrabold text-white" aria-hidden="true">
              L
            </span>
            <span>
              <b className="block text-base">{SITE_CONFIG.name}</b>
              <span className="block text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-muted">
                {SITE_CONFIG.tagline}
              </span>
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted">
            Nền tảng học từ vựng cho IELTS và tiếng Trung, có đồng bộ Google Sheets cho giáo viên.
          </p>
        </div>
        <nav aria-label="Liên kết pháp lý" className="flex flex-col gap-2 text-sm">
          <Link href="/" className="font-semibold text-ink hover:text-golddark hover:underline">
            Trang chủ
          </Link>
          <Link href="/privacy" className="font-semibold text-ink hover:text-golddark hover:underline">
            Privacy Policy
          </Link>
          <Link href="/terms" className="font-semibold text-ink hover:text-golddark hover:underline">
            Terms of Service
          </Link>
          <Link href="/login" className="font-semibold text-ink hover:text-golddark hover:underline">
            Đăng nhập
          </Link>
        </nav>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto w-full max-w-5xl px-5 py-5 text-xs text-muted sm:px-8">
          © {new Date().getFullYear()} {SITE_CONFIG.legalName}. Mọi quyền được bảo lưu.
        </p>
      </div>
    </footer>
  );
}