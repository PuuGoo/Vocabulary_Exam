import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function routeFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? routeFiles(path) : name === "route.ts" ? [path] : [];
  });
}

test("every admin API route uses current-database permission authorization", () => {
  for (const path of routeFiles("src/app/api/admin")) {
    const source = readFileSync(path, "utf8");
    if (path.endsWith(join("me", "permissions", "route.ts"))) {
      assert.match(source, /getAdminAccess/, path);
    } else {
      assert.match(source, /require(?:Any)?AdminPermission/, path);
    }
    assert.doesNotMatch(source, /session\.role\s*[!=]==?\s*["']admin["']/, path);
  }
});

test("critical mutations use distinct destructive permissions", () => {
  const cases: Array<[string, RegExp]> = [
    ["src/app/api/sets/[id]/route.ts", /requireAdminPermission\("vocab\.delete"\)/],
    ["src/app/api/admin/sets/[id]/words/reorder/route.ts", /requireAdminPermission\("vocab\.reorder"\)/],
    ["src/app/api/admin/category-questions/route.ts", /requireAdminPermission\("questions\.delete"\)/],
    ["src/app/api/admin/category-documents/route.ts", /requireAdminPermission\("documents\.delete"\)/],
    ["src/app/api/admin/backup/restore/commit/route.ts", /requireAdminPermission\("backup\.restore"\)/],
    ["src/app/api/admin/registration-settings/route.ts", /requireAdminPermission\("registration\.manage"\)/],
    ["src/app/api/admin/users/[id]/permissions/route.ts", /requireAdminPermission\("permissions\.manage"\)/],
  ];
  for (const [path, pattern] of cases) assert.match(readFileSync(path, "utf8"), pattern, path);
});

test("authorization refreshes current user and migration guarantees an owner", () => {
  const authorization = readFileSync("src/lib/adminAuthorization.ts", "utf8");
  const auth = readFileSync("src/lib/auth.ts", "utf8");
  const migration = readFileSync("drizzle/0029_admin_rbac.sql", "utf8");
  assert.match(authorization, /\.from\(users\)/);
  assert.match(authorization, /user\.role !== "admin"/);
  assert.match(auth, /\.from\(users\)/);
  assert.match(migration, /"admin_profile" = 'owner'/);
  assert.match(migration, /min\("id"\)/);
  assert.match(migration, /admin_permission_overrides/);
  assert.match(migration, /admin_audit_logs/);
});

test("last-owner changes are serialized and rejected", () => {
  for (const path of ["src/app/api/admin/users/[id]/route.ts", "src/app/api/admin/users/[id]/permissions/route.ts"]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /pg_advisory_xact_lock/, path);
    assert.match(source, /last_owner/, path);
    assert.match(source, /status: 409/, path);
  }
});
