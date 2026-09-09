import test from "node:test";
import assert from "node:assert/strict";
import { ADMIN_PERMISSIONS, resolveAdminPermissions } from "./adminPermissions";

test("owner has every known permission and ignores deny overrides", () => {
  const permissions = resolveAdminPermissions("owner", [{ permission: "backup.restore", allowed: false }]);
  assert.equal(permissions.size, ADMIN_PERMISSIONS.length);
  assert.equal(permissions.has("backup.restore"), true);
});

test("viewer is read-only", () => {
  const permissions = resolveAdminPermissions("viewer");
  assert.equal(permissions.has("vocab.view"), true);
  assert.equal(permissions.has("vocab.edit"), false);
  assert.equal(permissions.has("vocab.delete"), false);
});

test("custom overrides and implicit view dependencies are applied", () => {
  const permissions = resolveAdminPermissions("custom", [{ permission: "vocab.edit", allowed: true }]);
  assert.equal(permissions.has("vocab.edit"), true);
  assert.equal(permissions.has("vocab.view"), true);
  assert.equal(permissions.has("vocab.delete"), false);
});

test("content editor cannot delete and manager cannot manage permissions or restore", () => {
  assert.equal(resolveAdminPermissions("content_editor").has("vocab.delete"), false);
  assert.equal(resolveAdminPermissions("manager").has("permissions.manage"), false);
  assert.equal(resolveAdminPermissions("manager").has("backup.restore"), false);
});
