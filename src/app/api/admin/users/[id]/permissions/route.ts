import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { adminAuditLogs, adminPermissionOverrides, users } from "@/db/schema";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { ADMIN_PERMISSIONS, ADMIN_PROFILES, ADMIN_PROFILE_PERMISSIONS, isAdminPermission, normalizePermissionSelection } from "@/lib/adminPermissions";

const schema = z.object({ profile: z.enum(ADMIN_PROFILES), permissions: z.array(z.string()).max(ADMIN_PERMISSIONS.length) });
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireAdminPermission("permissions.manage");
  if (isAuthorizationError(access)) return access;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.permissions.some((permission) => !isAdminPermission(permission))) return NextResponse.json({ error: "Cấu hình quyền không hợp lệ." }, { status: 400 });
  const targetId = Number(params.id);
  const selected = new Set(normalizePermissionSelection(parsed.data.permissions));
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(72341)`);
    const [target] = await tx.select().from(users).where(eq(users.id, targetId)).limit(1);
    if (!target || target.role !== "admin") return "missing" as const;
    if (target.adminProfile === "owner" && parsed.data.profile !== "owner") {
      const owners = await tx.select({ id: users.id }).from(users).where(eq(users.adminProfile, "owner"));
      if (owners.length <= 1) return "last_owner" as const;
    }
    await tx.update(users).set({ adminProfile: parsed.data.profile }).where(eq(users.id, targetId));
    await tx.delete(adminPermissionOverrides).where(eq(adminPermissionOverrides.userId, targetId));
    if (parsed.data.profile !== "owner") {
      const base = new Set(ADMIN_PROFILE_PERMISSIONS[parsed.data.profile]);
      const rows = ADMIN_PERMISSIONS.flatMap((permission) => selected.has(permission) === base.has(permission) ? [] : [{ userId: targetId, permission, allowed: selected.has(permission) }]);
      if (rows.length) await tx.insert(adminPermissionOverrides).values(rows);
    }
    await tx.insert(adminAuditLogs).values({ actorUserId: access.userId, actorDisplayName: access.displayName, action: "admin.permissions.update", resourceType: "user", resourceId: String(targetId), targetUserId: targetId, metadata: JSON.stringify({ beforeProfile: target.adminProfile, afterProfile: parsed.data.profile, permissions: [...selected] }) });
    return "ok" as const;
  });
  if (result === "missing") return NextResponse.json({ error: "Không tìm thấy tài khoản admin." }, { status: 404 });
  if (result === "last_owner") return NextResponse.json({ error: "Không thể hạ quyền Owner cuối cùng." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
