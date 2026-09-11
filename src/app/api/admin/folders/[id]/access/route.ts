import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { contentFolders, folderAccess, users } from "@/db/schema";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { applyFolderAccessChanges } from "@/lib/folderAccessManagement";
import { requireAdminResourceAccess } from "@/lib/folderAuthorization";
import { isFolderAccessLevel, resolveFolderAccessDetailFromRows } from "@/lib/folderAuthorizationCore";

async function authorize(folderId: number) {
  const global = await requireAdminPermission("folders.share");
  if (isAuthorizationError(global)) return global;
  return requireAdminResourceAccess({ permission: "folders.share", folderId, level: "manager", access: global });
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const folderId = Number(params.id);
  if (!Number.isInteger(folderId) || folderId < 1) return NextResponse.json({ error: "Thư mục không hợp lệ." }, { status: 400 });
  const access = await authorize(folderId);
  if (access instanceof NextResponse) return access;

  const [folder, folders, rules, admins] = await Promise.all([
    db.query.contentFolders.findFirst({ where: eq(contentFolders.id, folderId) }),
    db.select({ id: contentFolders.id, name: contentFolders.name, parentId: contentFolders.parentId, ownerUserId: contentFolders.ownerUserId, kind: contentFolders.kind, archivedAt: contentFolders.archivedAt }).from(contentFolders),
    db.select({ folderId: folderAccess.folderId, userId: folderAccess.userId, accessLevel: folderAccess.accessLevel }).from(folderAccess),
    db.select({ id: users.id, displayName: users.displayName, username: users.username, role: users.role, adminProfile: users.adminProfile }).from(users).where(eq(users.role, "admin")),
  ]);
  if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const folderNameById = new Map(folders.map((item) => [item.id, item.name]));
  const exactByUser = new Map(rules.filter((rule) => rule.folderId === folderId).map((rule) => [rule.userId, rule.accessLevel]));
  const manageableAdmins = admins.filter((admin) => admin.id !== access.userId && admin.id !== folder.ownerUserId && admin.adminProfile !== "owner");
  const resolved = manageableAdmins.map((admin) => {
    const detail = resolveFolderAccessDetailFromRows(admin.id, admin.adminProfile || "viewer", folderId, folders, rules);
    const explicitAccessLevel = exactByUser.get(admin.id) ?? null;
    const inherited = folder.parentId
      ? resolveFolderAccessDetailFromRows(admin.id, admin.adminProfile || "viewer", folder.parentId, folders, rules)
      : null;
    return {
      userId: admin.id,
      displayName: admin.displayName,
      username: admin.username,
      explicitAccessLevel,
      effectiveAccessLevel: detail.level,
      inheritedAccessLevel: inherited?.level ?? null,
      inheritedFromFolderId: inherited?.sourceFolderId ?? null,
      inheritedFromFolderName: inherited?.sourceFolderId ? folderNameById.get(inherited.sourceFolderId) ?? null : null,
    };
  });

  return NextResponse.json({
    folder: { id: folder.id, name: folder.name, ownerUserId: folder.ownerUserId },
    entries: resolved.filter((entry) => entry.explicitAccessLevel !== null || entry.effectiveAccessLevel !== null),
    candidates: resolved.filter((entry) => entry.explicitAccessLevel === null && entry.effectiveAccessLevel === null)
      .map(({ userId, displayName, username }) => ({ userId, displayName, username })),
  });
}

const schema = z.object({ userId: z.number().int().positive(), accessLevel: z.string().nullable() });
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const folderId = Number(params.id);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!Number.isInteger(folderId) || !parsed.success || (parsed.data.accessLevel !== null && !isFolderAccessLevel(parsed.data.accessLevel))) {
    return NextResponse.json({ error: "Dữ liệu quyền thư mục không hợp lệ." }, { status: 400 });
  }
  const access = await authorize(folderId);
  if (access instanceof NextResponse) return access;
  const result = await applyFolderAccessChanges(access, folderId, [{
    userId: parsed.data.userId,
    accessLevel: parsed.data.accessLevel,
  }]);
  if (!result.ok) {
    const status = result.code === "FOLDER_NOT_FOUND" ? 404 : result.code === "PROTECTED_TARGET" ? 409 : 400;
    return NextResponse.json({ error: result.code === "PROTECTED_TARGET" ? "Không thể thay đổi quyền của chủ sở hữu, chính bạn hoặc System Owner." : "Quản trị viên không hợp lệ.", code: result.code }, { status });
  }
  return NextResponse.json({ ok: true, changed: result.changed });
}
