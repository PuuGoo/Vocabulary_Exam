import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

process.env.JWT_SECRET ||= "middleware-test-secret-at-least-32-characters-long";
const middlewareModule = import("./middleware");

function anonymous(pathname: string) {
  return new NextRequest(`https://example.com${pathname}`);
}

test("anonymous admin page still redirects to login", async () => {
  const { middleware } = await middlewareModule;
  const response = await middleware(anonymous("/admin"));
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location")!).pathname, "/login");
});

test("anonymous admin API remains protected by existing middleware behavior", async () => {
  const { middleware } = await middlewareModule;
  const response = await middleware(anonymous("/api/admin/backup/schedule"));
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location")!).pathname, "/login");
});

test("backup cron bypasses session middleware without redirecting", async () => {
  const { BACKUP_CRON_PATH, middleware } = await middlewareModule;
  const response = await middleware(anonymous(BACKUP_CRON_PATH));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-middleware-next"), "1");
  assert.equal(response.headers.has("location"), false);
});

test("only the exact backup cron path receives the session exemption", async () => {
  const { BACKUP_CRON_PATH, middleware } = await middlewareModule;
  const response = await middleware(anonymous(`${BACKUP_CRON_PATH}/unexpected`));
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location")!).pathname, "/login");
});

test("public homepage, privacy policy and terms are reachable without a session", async () => {
  const { middleware } = await middlewareModule;
  for (const pathname of ["/", "/privacy", "/terms"]) {
    const response = await middleware(anonymous(pathname));
    assert.equal(response.status, 200, pathname);
    assert.equal(response.headers.get("x-middleware-next"), "1", pathname);
    assert.equal(response.headers.has("location"), false, pathname);
  }
});

test("admin and admin APIs remain protected for anonymous visitors", async () => {
  const { middleware } = await middlewareModule;
  for (const pathname of ["/admin", "/admin/sets", "/api/admin/google-sheets/connections", "/api/admin/sets"]) {
    const response = await middleware(anonymous(pathname));
    assert.equal(response.status, 307, pathname);
    assert.equal(new URL(response.headers.get("location")!).pathname, "/login", pathname);
  }
});

test("student routes stay protected for anonymous visitors", async () => {
  const { middleware } = await middlewareModule;
  for (const pathname of ["/dashboard", "/study", "/learn/123"]) {
    const response = await middleware(anonymous(pathname));
    assert.equal(response.status, 307, pathname);
    assert.equal(new URL(response.headers.get("location")!).pathname, "/login", pathname);
  }
});

test("only the exact public paths are exempt; lookalikes still redirect", async () => {
  const { middleware } = await middlewareModule;
  for (const pathname of ["/privacy-policy", "/terms/extra", "/admin", "/dashboard"]) {
    const response = await middleware(anonymous(pathname));
    assert.equal(response.status, 307, pathname);
    assert.equal(new URL(response.headers.get("location")!).pathname, "/login", pathname);
  }
});

test("anonymous share pages and share APIs bypass the session redirect only", async () => {
  const { middleware } = await middlewareModule;
  for (const pathname of ["/s/AbCdEf1234567890", "/api/share/AbCdEf1234567890"]) {
    const response = await middleware(anonymous(pathname));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-middleware-next"), "1");
  }
});
