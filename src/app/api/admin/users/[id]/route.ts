import { NextRequest, NextResponse } from "next/server";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { adminAuditLogs, adminPermissionOverrides, contentFolders, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { ADMIN_PROFILES } from "@/lib/adminPermissions";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function isLastOwner(tx: Tx, userId: number) {
  const [target] = await tx.select({ role: users.role, profile: users.adminProfile }).from(users).where(eq(users.id, userId)).limit(1);
  if (!target || target.role !== "admin" || target.profile !== "owner") return false;
  const [other] = await tx.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), eq(users.adminProfile, "owner"), ne(users.id, userId))).limit(1);
  return !other;
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireAdminPermission("users.delete");
  if (isAuthorizationError(access)) return access;
  const targetId = Number(params.id);
  if (!Number.isInteger(targetId)) return NextResponse.json({ error: "Người dùng không hợp lệ." }, { status: 400 });
  if (targetId === access.userId) return NextResponse.json({ error: "Không thể tự xóa tài khoản đang đăng nhập." }, { status: 400 });
  const outcome = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(72341)`);
    const [target] = await tx.select({ id: users.id, role: users.role, adminProfile: users.adminProfile, displayName: users.displayName }).from(users).where(eq(users.id, targetId)).limit(1);
    if (!target) return "missing" as const;
    if (target.role === "admin" && !access.can("permissions.manage")) return "forbidden" as const;
    if (await isLastOwner(tx, targetId)) return "last_owner" as const;
    await tx.update(contentFolders).set({ archivedAt: new Date(), updatedAt: new Date() }).where(and(eq(contentFolders.ownerUserId, targetId), eq(contentFolders.kind, "personal_root")));
    await tx.insert(adminAuditLogs).values({ actorUserId: access.userId, actorDisplayName: access.displayName, action: "user.delete", resourceType: "user", resourceId: String(targetId), targetUserId: targetId, metadata: JSON.stringify({ role: target.role, profile: target.adminProfile, displayName: target.displayName }) });
    await tx.delete(users).where(eq(users.id, targetId));
    return "ok" as const;
  });
  if (outcome === "missing") return NextResponse.json({ error: "Không tìm thấy người dùng." }, { status: 404 });
  if (outcome === "forbidden") return NextResponse.json({ error: "Forbidden", code: "ADMIN_PERMISSION_REQUIRED", permission: "permissions.manage" }, { status: 403 });
  if (outcome === "last_owner") return NextResponse.json({ error: "Không thể xóa Owner cuối cùng." }, { status: 409 });
  return NextResponse.json({ ok: true });
}

const patchSchema = z.object({ newPassword: z.string().min(6).max(128).optional(), role: z.enum(["admin", "student"]).optional(), adminProfile: z.enum(ADMIN_PROFILES).optional() });
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  const required = parsed.data.role || parsed.data.adminProfile ? "permissions.manage" as const : parsed.data.newPassword ? "users.reset_password" as const : "users.edit" as const;
  const access = await requireAdminPermission(required);
  if (isAuthorizationError(access)) return access;
  const targetId = Number(params.id);
  const passwordHash = parsed.data.newPassword ? await hashPassword(parsed.data.newPassword) : undefined;
  const outcome = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(72341)`);
    const [target] = await tx.select().from(users).where(eq(users.id, targetId)).limit(1);
    if (!target) return "missing" as const;
    const nextRole = parsed.data.role ?? target.role;
    const nextProfile = nextRole === "admin" ? parsed.data.adminProfile ?? target.adminProfile ?? "viewer" : null;
    if (target.role === "admin" && target.adminProfile === "owner" && (nextRole !== "admin" || nextProfile !== "owner") && await isLastOwner(tx, targetId)) return "last_owner" as const;
    await tx.update(users).set({ ...(passwordHash ? { passwordHash } : {}), role: nextRole, adminProfile: nextProfile }).where(eq(users.id, targetId));
    if (nextRole !== "admin") {
      await tx.delete(adminPermissionOverrides).where(eq(adminPermissionOverrides.userId, targetId));
      await tx.update(contentFolders).set({ archivedAt: new Date(), updatedAt: new Date() }).where(and(eq(contentFolders.ownerUserId, targetId), eq(contentFolders.kind, "personal_root")));
    } else if (target.role !== "admin") {
      const [workspace] = await tx.select({ id: contentFolders.id }).from(contentFolders).where(and(eq(contentFolders.ownerUserId, targetId), eq(contentFolders.kind, "personal_root"))).limit(1);
      if (workspace) await tx.update(contentFolders).set({ archivedAt: null, updatedAt: new Date() }).where(eq(contentFolders.id, workspace.id));
      else await tx.insert(contentFolders).values({ name: "Không gian của tôi", normalizedName: "không gian của tôi", ownerUserId: targetId, kind: "personal_root", createdBy: access.userId });
    }
    await tx.insert(adminAuditLogs).values({ actorUserId: access.userId, actorDisplayName: access.displayName, action: parsed.data.role || parsed.data.adminProfile ? "admin.profile.update" : "user.password_reset", resourceType: "user", resourceId: String(targetId), targetUserId: targetId, metadata: JSON.stringify({ beforeRole: target.role, afterRole: nextRole, beforeProfile: target.adminProfile, afterProfile: nextProfile }) });
    return "ok" as const;
  });
  if (outcome === "missing") return NextResponse.json({ error: "Không tìm thấy người dùng." }, { status: 404 });
  if (outcome === "last_owner") return NextResponse.json({ error: "Hệ thống phải luôn có ít nhất một Owner." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
