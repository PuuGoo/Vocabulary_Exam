import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PUBLIC_ROUTES, SITE_CONFIG, publicSiteUrl } from "@/lib/siteConfig";

/**
 * The public pages are the URLs Google reads for the OAuth consent screen, so
 * they must stay public, match the deployed domain, describe only the scopes
 * the code actually requests, and never invent a contact address.
 */

/** JSX wraps copy across lines, so assertions run against flattened text. */
/** JSX wraps copy across lines: collapse whitespace but keep tags/attributes. */
function flat(file: string): string {
  return readFileSync(file, "utf8").replace(/\s+/g, " ");
}

/** Same, but drop JSX tags so prose split by <b> still reads as sentences. */
function prose(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ");
}

test("public routes are exactly the three Google consent-screen URLs", () => {
  assert.deepEqual([...PUBLIC_ROUTES], ["/", "/privacy", "/terms"]);
  assert.equal(publicSiteUrl("/"), "https://vocabulary-exam.vercel.app/");
  assert.equal(publicSiteUrl("/privacy"), "https://vocabulary-exam.vercel.app/privacy");
  assert.equal(publicSiteUrl("/terms"), "https://vocabulary-exam.vercel.app/terms");
});

test("every public URL is absolute HTTPS on the deployed domain", () => {
  for (const url of [SITE_CONFIG.homeUrl, SITE_CONFIG.privacyUrl, SITE_CONFIG.termsUrl, SITE_CONFIG.loginUrl, SITE_CONFIG.registerUrl]) {
    assert.ok(url.startsWith("https://"), url);
    assert.ok(url.includes("vocabulary-exam.vercel.app"), url);
  }
});

test("no fabricated contact address is committed", () => {
  assert.equal(SITE_CONFIG.contactEmail, "", "contactEmail must stay empty until a real monitored address is provided");
});

test("the privacy page never claims Google approval or verification", () => {
  const source = prose("src/app/privacy/page.tsx");
  assert.ok(source.includes("không tuyên bố rằng ứng dụng này đã được Google phê duyệt hay xác minh"), "the policy must explicitly deny Google approval");
  assert.ok(!/Google đã (?:phê duyệt|xác minh) ứng dụng/i.test(source), "must not assert Google approval in the affirmative");
  assert.ok(source.includes("không bán dữ liệu Google"), "the policy must state Google data is not sold");
  assert.ok(source.includes("không dùng dữ liệu Google để quảng cáo"), "the policy must state no advertising use");
});

test("the privacy page describes only the scopes the code actually requests", () => {
  const privacy = prose("src/app/privacy/page.tsx");
  const scopes = flat("src/lib/googleSheets/auth.ts");
  assert.ok(scopes.includes("auth/spreadsheets"), "the code must still request the Sheets scope");
  assert.ok(scopes.includes("auth/drive.file"), "the code must still request file-level Drive access");
  assert.ok(privacy.includes("drive.file"), "the policy must name the file-level Drive scope");
  assert.ok(privacy.includes("không phải quyền truy cập toàn bần Google Drive".replace("bần", "bộ")), "the policy must not imply full Drive access");
  assert.ok(!privacy.includes("toàn bộ Google Drive của bạn.\n"), "the policy must qualify the Drive scope statement");
});

test("the privacy page names the providers the codebase actually uses", () => {
  const privacy = flat("src/app/privacy/page.tsx");
  for (const provider of ["Google APIs", "Vercel", "PostgreSQL", "SMTP", "Vercel Blob"]) {
    assert.ok(privacy.includes(provider), `missing provider: ${provider}`);
  }
});

test("the terms page covers the expected sections", () => {
  const source = flat("src/app/terms/page.tsx");
  for (const needle of [
    "Chấp nhận điều khoản", "Tài khoản", "Sử dụng phù hợp", "Nội dung do người dùng tạo",
    "Tích hợp Google Sheets", "Dịch vụ bên thứ ba", "Tính khả dụng", "Giới hạn trách nhiệm", "Thay đổi điều khoản",
  ]) {
    assert.ok(source.includes(needle), `missing terms section: ${needle}`);
  }
});

test("both policy pages link home, the other policy and login, and reuse the footer", () => {
  for (const file of ["src/app/privacy/page.tsx", "src/app/terms/page.tsx"]) {
    const source = flat(file);
    assert.ok(source.includes('href="/"'), `${file} must link home`);
    assert.ok(source.includes('href="/login"'), `${file} must link login`);
    assert.ok(source.includes('href="/privacy"') || source.includes('href="/terms"'), `${file} must link the other policy`);
    assert.ok(source.includes("<PublicFooter />"), `${file} must reuse the shared footer`);
  }
});

test("the homepage advertises the real feature set and links the policies", () => {
  const copy = prose("src/app/page.tsx");
  const markup = flat("src/app/page.tsx");
  for (const needle of ["IELTS", "Google Sheets", "spaced repetition", "Quiz", "Privacy Policy", "Terms of Service"]) {
    assert.ok(copy.includes(needle), `homepage missing: ${needle}`);
  }
  assert.ok(markup.includes('href="/privacy"'), "homepage must link the privacy policy");
  assert.ok(markup.includes('href="/terms"'), "homepage must link the terms");
  assert.ok(markup.includes('href="/login"'), "homepage must link login");
  assert.ok(markup.includes('href="/register"'), "homepage must link register");
  assert.match(copy, /Google không xác nhận hay đánh giá nội dung trên trang này/, "must carry the Google endorsement disclaimer");
});

test("the homepage is server-rendered and only redirects signed-in users", () => {
  const source = flat("src/app/page.tsx");
  assert.ok(!source.startsWith('"use client"'), "the landing page must not depend on client JavaScript");
  assert.ok(source.includes("getSession()"), "the page must decide server-side where a signed-in user goes");
  assert.ok(source.includes('redirect(session.role === "admin" ? "/admin" : "/dashboard")'), "signed-in users go to their workspace");
});

test("the public footer is server-rendered and links the legal pages", () => {
  const source = flat("src/components/PublicFooter.tsx");
  assert.ok(!source.startsWith('"use client"'), "the footer must render on the server");
  for (const needle of ['href="/privacy"', 'href="/terms"', 'href="/login"']) {
    assert.ok(source.includes(needle), `footer missing ${needle}`);
  }
});

test("middleware exposes the three public pages without touching protected areas", () => {
  const source = flat("src/middleware.ts");
  assert.match(source, /PUBLIC_PATHS = \[[^\]]*"\/privacy"[^\]]*"\/terms"/, "public pages must be listed as public");
  assert.ok(source.includes('pathname.startsWith("/admin")'), "admin pages must stay guarded");
  assert.ok(source.includes('pathname.startsWith("/api/admin")'), "admin APIs must stay guarded");
  assert.ok(!source.includes(': "/login"'), "middleware must not redirect the root to /login any more");
});
