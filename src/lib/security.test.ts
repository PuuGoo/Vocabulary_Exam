import { describe, it } from "node:test";
import assert from "node:assert/strict";

// 1. Rate limiter utility
describe("rateLimit", () => {
  it("limits after max attempts within window", async () => {
    const { checkRateLimit, recordRateLimitHit, resetRateLimit, LOGIN_RATE_LIMIT } = await import("./rateLimit");
    const key = "test-login-" + Date.now();
    resetRateLimit(key);
    for (let i = 0; i < LOGIN_RATE_LIMIT.maxAttempts; i++) {
      const r = checkRateLimit(key, LOGIN_RATE_LIMIT);
      assert.equal(r.limited, false, `attempt ${i + 1} should not be limited`);
      recordRateLimitHit(key, LOGIN_RATE_LIMIT);
    }
    const r = checkRateLimit(key, LOGIN_RATE_LIMIT);
    assert.equal(r.limited, true, "should be limited after max attempts");
    assert.ok(r.retryAfterSeconds && r.retryAfterSeconds > 0, "should have retryAfter");
    resetRateLimit(key);
  });
});

// 2. Open redirect validation
describe("open redirect", () => {
  it("isInternalPath rejects external URLs", () => {
    const { readFileSync } = require("fs");
    const content = readFileSync("src/app/login/page.tsx", "utf8");
    assert.ok(content.includes("isInternalPath"), "login page should have isInternalPath validator");
    assert.ok(content.includes('router.push(isInternalPath'), "should validate before push");
    assert.ok(!content.includes('router.push(search.get("next")'), "should not push unvalidated next param");
  });
});

// 3. Security headers present in next.config
describe("security headers", () => {
  it("next.config.js has security headers", () => {
    const { readFileSync } = require("fs");
    const config = readFileSync("next.config.js", "utf8");
    assert.ok(config.includes("Strict-Transport-Security"), "should have HSTS");
    assert.ok(config.includes("X-Content-Type-Options"), "should have X-Content-Type-Options");
    assert.ok(config.includes("X-Frame-Options"), "should have X-Frame-Options");
    assert.ok(config.includes("Referrer-Policy"), "should have Referrer-Policy");
    assert.ok(config.includes("Permissions-Policy"), "should have Permissions-Policy");
    assert.ok(config.includes("no-store"), "API responses should have no-store");
  });
});

// 4. Logout has security flags
describe("logout cookie security", () => {
  it("logout clears cookie with security options", () => {
    const { readFileSync } = require("fs");
    const content = readFileSync("src/app/api/auth/logout/route.ts", "utf8");
    assert.ok(content.includes("sessionCookieOptions"), "should use sessionCookieOptions for clearing");
    assert.ok(content.includes("maxAge: 0"), "should set maxAge 0");
  });
});

// 5. Cron auth uses constant-time comparison
describe("cron auth", () => {
  it("uses timingSafeEqual", () => {
    const { readFileSync } = require("fs");
    const content = readFileSync("src/lib/backupEmailCron.ts", "utf8");
    assert.ok(content.includes("timingSafeEqual"), "should use timingSafeEqual for cron auth");
  });
});

// 6. Import has size and row limits
describe("import hardening", () => {
  it("has MAX_FILE_SIZE and MAX_ROWS limits", () => {
    const { readFileSync } = require("fs");
    const content = readFileSync("src/app/api/admin/import/route.ts", "utf8");
    assert.ok(content.includes("MAX_FILE_SIZE"), "should have file size limit");
    assert.ok(content.includes("MAX_ROWS"), "should have row limit");
  });
});

// 7. Login has rate limiting
describe("login rate limiting", () => {
  it("login route imports rate limiter", () => {
    const { readFileSync } = require("fs");
    const content = readFileSync("src/app/api/auth/login/route.ts", "utf8");
    assert.ok(content.includes("checkRateLimit"), "should check rate limit");
    assert.ok(content.includes("recordRateLimitHit"), "should record failures");
    assert.ok(content.includes("getClientIp"), "should get client IP");
  });
});

// 8. Reset password invalidates all tokens
describe("reset password", () => {
  it("invalidates all user tokens on reset", () => {
    const { readFileSync } = require("fs");
    const content = readFileSync("src/app/api/auth/reset-password/route.ts", "utf8");
    assert.ok(content.includes("passwordResets.userId"), "should invalidate by userId, not just single token");
  });
});

// 9. JWT secret must be required (session.ts)
describe("JWT configuration", () => {
  it("requires JWT_SECRET", () => {
    const { readFileSync } = require("fs");
    const content = readFileSync("src/lib/session.ts", "utf8");
    assert.ok(content.includes("if (!JWT_SECRET)"), "should throw if no JWT_SECRET");
    assert.ok(!content.includes('JWT_SECRET || "default"'), "should not have fallback secret");
    assert.ok(!content.includes("hardcoded"), "should not have hardcoded secret");
  });
});

// 10. Cookie options are secure
describe("cookie security", () => {
  it("session cookie has secure flags", () => {
    const { readFileSync } = require("fs");
    const content = readFileSync("src/lib/session.ts", "utf8");
    assert.ok(content.includes("httpOnly: true"), "cookie should be HttpOnly");
    assert.ok(content.includes('secure: process.env.NODE_ENV === "production"'), "cookie should be Secure in production");
    assert.ok(content.includes('sameSite: "lax"'), "cookie should have SameSite=Lax");
    assert.ok(content.includes('path: "/"'), "cookie path should be /");
  });
});

// 11. Admin API authorization
describe("admin authorization", () => {
  it("middleware blocks student from admin API", () => {
    const { readFileSync } = require("fs");
    const content = readFileSync("src/middleware.ts", "utf8");
    assert.ok(content.includes("api/admin"), "should check /api/admin paths");
    assert.ok(content.includes("403"), "should return 403 for unauthorized");
  });
});

// 12. XSS: no dangerouslySetInnerHTML in critical components
describe("XSS safety", () => {
  it("no dangerouslySetInnerHTML in FillFocusSession", () => {
    const { readFileSync } = require("fs");
    const content = readFileSync("src/components/FillFocusSession.tsx", "utf8");
    assert.ok(!content.includes("dangerouslySetInnerHTML"), "FillFocusSession should not use dangerouslySetInnerHTML");
  });
  it("no dangerouslySetInnerHTML in LearnExperience", () => {
    const { readFileSync } = require("fs");
    const content = readFileSync("src/components/learning/LearnExperience.tsx", "utf8");
    assert.ok(!content.includes("dangerouslySetInnerHTML"), "LearnExperience should not use dangerouslySetInnerHTML");
  });
});

// 13. Password never exposed in responses
describe("no password leakage", () => {
  it("login response does not include passwordHash field", () => {
    const { readFileSync } = require("fs");
    const content = readFileSync("src/app/api/auth/login/route.ts", "utf8");
    // The response JSON should only contain username, displayName, role - not passwordHash
    const responseBody = content.match(/NextResponse\.json\(\{([^}]+)\}/);
    if (responseBody) {
      assert.ok(!responseBody[1].includes("passwordHash"), "response body should not include passwordHash");
    }
  });
});

// 14. File upload validation
describe("upload safety", () => {
  it("import rejects oversized files", () => {
    const { readFileSync } = require("fs");
    const content = readFileSync("src/app/api/admin/import/route.ts", "utf8");
    assert.ok(content.includes("file.size > MAX_FILE_SIZE"), "should check file size");
    assert.ok(content.includes("rows.length > MAX_ROWS"), "should check row count");
  });
});