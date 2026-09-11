import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(path, "utf8");

test("schema defines stable folders, inherited ACL and publication state", () => {
  const schema = source("src/db/schema.ts");
  assert.match(schema, /export const contentFolders = pgTable/);
  assert.match(schema, /export const folderAccess = pgTable/);
  assert.match(schema, /folderId: integer\("folder_id"\)/);
  assert.match(schema, /publicationStatus: varchar\("publication_status"/);
});

test("admin resource routes combine RBAC with folder scope", () => {
  for (const path of [
    "src/app/api/sets/[id]/route.ts",
    "src/app/api/admin/category-documents/route.ts",
    "src/app/api/admin/category-questions/route.ts",
    "src/app/api/admin/import/route.ts",
    "src/app/api/share/route.ts",
  ]) assert.match(source(path), /requireAdminResourceAccess/);
  assert.match(source("src/app/api/sets/route.ts"), /getVisibleFolderIds/);
  assert.match(source("src/app/api/admin/words/search/route.ts"), /getVisibleFolderIds/);
});

test("student discovery defaults to published content only", () => {
  for (const path of [
    "src/app/api/sets/route.ts",
    "src/app/api/sets/[id]/route.ts",
    "src/app/api/daily-challenge/route.ts",
    "src/app/api/quick-practice/route.ts",
    "src/app/api/smart-review/route.ts",
  ]) assert.match(source(path), /publicationStatus/);
});

test("migration preserves legacy content and creates private roots", () => {
  const migration = source("drizzle/0031_personal_workspaces.sql");
  assert.match(migration, /kind='personal_root'/);
  assert.match(migration, /legacy_folder_map/);
  assert.match(migration, /folder_acl_publication_backfilled/);
  assert.match(migration, /folder_acl_share_targets_migrated/);
  assert.match(migration, /folder_acl_legacy_content_mapped/);
});

test("workspace access manager lists recipients and applies atomic bulk changes", () => {
  const single = source("src/app/api/admin/folders/[id]/access/route.ts");
  const bulk = source("src/app/api/admin/folders/[id]/access/bulk/route.ts");
  const service = source("src/lib/folderAccessManagement.ts");
  const ui = source("src/components/FolderAccessManager.tsx");
  assert.match(single, /export async function GET/);
  assert.match(single, /export async function PATCH/);
  assert.match(bulk, /\.max\(100\)/);
  assert.match(service, /db\.transaction/);
  assert.match(service, /folder\.access\.revoke/);
  assert.match(ui, /Chọn tất cả kết quả đang hiển thị/);
  assert.match(ui, /Khôi phục quyền kế thừa/);
});
