import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { contentFolders, folderAccess, users } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { getAdminAccess, type AdminAccess, adminPermissionError } from "@/lib/adminAuthorization";
import type { AdminPermission } from "@/lib/adminPermissions";
import { folderAccessSatisfies, normalizeFolderName, resolveFolderAccessFromRows, type FolderAccessLevel, type PositiveFolderAccess } from "@/lib/folderAuthorizationCore";

async function loadRows(userId: number) {
  const [folders, rules] = await Promise.all([
    db.select({ id: contentFolders.id, parentId: contentFolders.parentId, ownerUserId: contentFolders.ownerUserId, kind: contentFolders.kind, archivedAt: contentFolders.archivedAt }).from(contentFolders),
    db.select({ folderId: folderAccess.folderId, userId: folderAccess.userId, accessLevel: folderAccess.accessLevel }).from(folderAccess).where(eq(folderAccess.userId, userId)),
  ]);
  return { folders, rules };
}

export async function getFolderAccess(access: AdminAccess, folderId: number): Promise<FolderAccessLevel | null> {
  const { folders, rules } = await loadRows(access.userId);
  return resolveFolderAccessFromRows(access.userId, access.profile, folderId, folders, rules);
}

export async function getVisibleFolderIds(access: AdminAccess): Promise<number[]> {
  const { folders, rules } = await loadRows(access.userId);
  return folders.filter((folder) => !folder.archivedAt && ![null, "deny"].includes(resolveFolderAccessFromRows(access.userId, access.profile, folder.id, folders, rules))).map((folder) => folder.id);
}

export async function getFolderAccessMap(access: AdminAccess, folderIds: readonly number[]) {
  const { folders, rules } = await loadRows(access.userId);
  return new Map(folderIds.map((id) => [id, resolveFolderAccessFromRows(access.userId, access.profile, id, folders, rules)]));
}

export function hiddenFolderResponse() {
  return NextResponse.json({ error: "Not found", code: "FOLDER_NOT_FOUND" }, { status: 404 });
}

export async function requireAdminResourceAccess(options: { permission: AdminPermission; folderId: number | null | undefined; level: PositiveFolderAccess; access?: AdminAccess }): Promise<AdminAccess | NextResponse> {
  const access = options.access ?? await (async () => { const session = await getSession(); return session ? getAdminAccess(session) : null; })();
  if (!access) return adminPermissionError(options.permission, 401);
  if (!access.can(options.permission)) return adminPermissionError(options.permission);
  if (!options.folderId) return hiddenFolderResponse();
  const actual = await getFolderAccess(access, options.folderId);
  if (actual === null || actual === "deny") return hiddenFolderResponse();
  if (!folderAccessSatisfies(actual, options.level)) return NextResponse.json({ error: "Forbidden", code: "FOLDER_ACCESS_REQUIRED", requiredLevel: options.level }, { status: 403 });
  return access;
}

export async function ensurePersonalWorkspace(userId: number) {
  const [user] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.role !== "admin") return null;
  const [existing] = await db.select().from(contentFolders).where(and(eq(contentFolders.ownerUserId, userId), eq(contentFolders.kind, "personal_root"), isNull(contentFolders.archivedAt))).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(contentFolders).values({ name: "Không gian của tôi", normalizedName: "không gian của tôi", ownerUserId: userId, kind: "personal_root", createdBy: userId }).returning();
  return created;
}

export async function getFolderLegacyPath(folderId: number) {
  const folders = await db.select({ id: contentFolders.id, parentId: contentFolders.parentId, name: contentFolders.name, kind: contentFolders.kind }).from(contentFolders);
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const parts: string[] = [];
  const seen = new Set<number>();
  let current = byId.get(folderId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.kind === "folder") parts.unshift(current.name);
    current = current.parentId == null ? undefined : byId.get(current.parentId);
  }
  return parts.join(" / ") || null;
}

function folderDisplayPathFromRows(access: AdminAccess, folderId: number, folders: Array<{ id: number; parentId: number | null; ownerUserId: number | null; name: string; kind: string; archivedAt: Date | null }>, rules: Array<{ folderId: number; userId: number; accessLevel: string }>) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const chain: typeof folders = []; const seen = new Set<number>(); let current = byId.get(folderId);
  while (current && !seen.has(current.id)) { seen.add(current.id); chain.unshift(current); current = current.parentId == null ? undefined : byId.get(current.parentId); }
  const ownRoot = chain.find((folder) => folder.kind === "personal_root" && folder.ownerUserId === access.userId);
  if (ownRoot) return ["Không gian của tôi", ...chain.slice(chain.indexOf(ownRoot) + 1).map((folder) => folder.name)].join(" / ");
  if (access.profile === "owner") { const root = chain.find((folder) => folder.kind === "personal_root"); return ["Tất cả không gian", root ? `Workspace #${root.id}` : chain[0]?.name, ...chain.slice(root ? chain.indexOf(root) + 1 : 1).map((folder) => folder.name)].filter(Boolean).join(" / "); }
  const firstVisible = chain.findIndex((folder) => { const level = resolveFolderAccessFromRows(access.userId, access.profile, folder.id, folders, rules); return level !== null && level !== "deny"; });
  return ["Được chia sẻ với tôi", ...chain.slice(Math.max(0, firstVisible)).map((folder) => folder.name)].join(" / ");
}

export async function getFolderDisplayPath(access: AdminAccess, folderId: number) {
  const [folders, rules] = await Promise.all([
    db.select({ id: contentFolders.id, parentId: contentFolders.parentId, ownerUserId: contentFolders.ownerUserId, name: contentFolders.name, kind: contentFolders.kind, archivedAt: contentFolders.archivedAt }).from(contentFolders),
    db.select({ folderId: folderAccess.folderId, userId: folderAccess.userId, accessLevel: folderAccess.accessLevel }).from(folderAccess).where(eq(folderAccess.userId, access.userId)),
  ]);
  return folderDisplayPathFromRows(access, folderId, folders, rules);
}

export async function getFolderDisplayPaths(access: AdminAccess, folderIds: readonly number[]) {
  const [folders, rules] = await Promise.all([
    db.select({ id: contentFolders.id, parentId: contentFolders.parentId, ownerUserId: contentFolders.ownerUserId, name: contentFolders.name, kind: contentFolders.kind, archivedAt: contentFolders.archivedAt }).from(contentFolders),
    db.select({ folderId: folderAccess.folderId, userId: folderAccess.userId, accessLevel: folderAccess.accessLevel }).from(folderAccess).where(eq(folderAccess.userId, access.userId)),
  ]);
  return new Map(folderIds.map((id) => [id, folderDisplayPathFromRows(access, id, folders, rules)]));
}

export async function findVisibleFolderIdByLegacyPath(access: AdminAccess, path: string) {
  const normalized = path.normalize("NFC").replace(/\s*\/\s*/g, " / ").trim().toLocaleLowerCase("vi");
  const visible = new Set(await getVisibleFolderIds(access));
  const [folders, rules] = await Promise.all([
    db.select({ id: contentFolders.id, parentId: contentFolders.parentId, ownerUserId: contentFolders.ownerUserId, name: contentFolders.name, kind: contentFolders.kind, archivedAt: contentFolders.archivedAt }).from(contentFolders),
    db.select({ folderId: folderAccess.folderId, userId: folderAccess.userId, accessLevel: folderAccess.accessLevel }).from(folderAccess).where(eq(folderAccess.userId, access.userId)),
  ]);
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  for (const folder of folders) {
    if (!visible.has(folder.id)) continue;
    const parts: string[] = []; const seen = new Set<number>(); let current: typeof folder | undefined = folder;
    while (current && !seen.has(current.id)) { seen.add(current.id); if (current.kind === "folder") parts.unshift(current.name); current = current.parentId == null ? undefined : byId.get(current.parentId); }
    if (parts.join(" / ").toLocaleLowerCase("vi") === normalized || folderDisplayPathFromRows(access, folder.id, folders, rules).toLocaleLowerCase("vi") === normalized) return folder.id;
  }
  return null;
}

export { folderAccessSatisfies, normalizeFolderName };
