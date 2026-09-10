import assert from "node:assert/strict";
import test from "node:test";
import { folderAccessSatisfies, resolveFolderAccessFromRows } from "./folderAuthorizationCore";

const folders = [
  { id: 1, parentId: null, ownerUserId: 1, kind: "personal_root", archivedAt: null },
  { id: 2, parentId: 1, ownerUserId: null, kind: "folder", archivedAt: null },
  { id: 3, parentId: 2, ownerUserId: null, kind: "folder", archivedAt: null },
  { id: 4, parentId: 3, ownerUserId: null, kind: "folder", archivedAt: null },
];

test("personal owner receives manager scope", () => assert.equal(resolveFolderAccessFromRows(1, "viewer", 4, folders, []), "manager"));
test("nearest deny overrides inherited editor", () => assert.equal(resolveFolderAccessFromRows(2, "manager", 4, folders, [{ folderId: 2, userId: 2, accessLevel: "editor" }, { folderId: 3, userId: 2, accessLevel: "deny" }]), "deny"));
test("specific child allow overrides hidden parent", () => {
  const rules = [{ folderId: 2, userId: 2, accessLevel: "deny" }, { folderId: 4, userId: 2, accessLevel: "viewer" }];
  assert.equal(resolveFolderAccessFromRows(2, "manager", 4, folders, rules), "viewer");
  assert.equal(resolveFolderAccessFromRows(2, "manager", 3, folders, rules), "deny");
});
test("system owner bypasses ACL and levels are ordered", () => {
  assert.equal(resolveFolderAccessFromRows(9, "owner", 4, folders, [{ folderId: 4, userId: 9, accessLevel: "deny" }]), "manager");
  assert.equal(folderAccessSatisfies("viewer", "editor"), false);
  assert.equal(folderAccessSatisfies("editor", "editor"), true);
});
