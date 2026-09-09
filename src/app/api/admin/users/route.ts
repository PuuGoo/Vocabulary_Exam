import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { adminAuditLogs, adminPermissionOverrides, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { ADMIN_PROFILES, isAdminProfile, resolveAdminPermissions } from "@/lib/adminPermissions";
import { normalizeText } from "@/lib/text";

export async function GET() {
  const access = await requireAdminPermission("users.view");
  if (isAuthorizationError(access)) return access;
  const rows = await db.select({ id: users.id, username: users.username, displayName: users.displayName, role: users.role, adminProfile: users.adminProfile, createdAt: users.createdAt }).from(users).orderBy(asc(users.createdAt));
  const overrides = await db.select({ userId: adminPermissionOverrides.userId, permission: adminPermissionOverrides.permission, allowed: adminPermissionOverrides.allowed }).from(adminPermissionOverrides);
  return NextResponse.json({ users: rows.map((user) => ({ ...user, permissions: user.role === "admin" ? [...resolveAdminPermissions(isAdminProfile(user.adminProfile) ? user.adminProfile : "manager", overrides.filter((item) => item.userId === user.id))] : [] })), capabilities: { canCreate: access.can("users.create"), canEdit: access.can("users.edit"), canDelete: access.can("users.delete"), canResetPassword: access.can("users.reset_password"), canManagePermissions: access.can("permissions.manage"), canViewRegistration: access.can("registration.view"), canManageRegistration: access.can("registration.manage") } });
}

const createSchema = z.object({ username: z.string().trim().min(3).max(64), password: z.string().min(6).max(128), displayName: z.string().trim().min(1).max(128), role: z.enum(["admin", "student"]), adminProfile: z.enum(ADMIN_PROFILES).optional() });

export async function POST(req: NextRequest) {
  const access = await requireAdminPermission("users.create");
  if (isAuthorizationError(access)) return access;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  if (parsed.data.role === "admin" && !access.can("permissions.manage")) return NextResponse.json({ error: "Forbidden", code: "ADMIN_PERMISSION_REQUIRED", permission: "permissions.manage" }, { status: 403 });
  const existing = await db.query.users.findFirst({ where: eq(users.username, parsed.data.username) });
  if (existing) return NextResponse.json({ error: "Tên đăng nhập đã tồn tại." }, { status: 409 });
  const profile = parsed.data.role === "admin" ? parsed.data.adminProfile ?? "viewer" : null;
  const passwordHash = await hashPassword(parsed.data.password);
  const user = await db.transaction(async (tx) => {
    const [created] = await tx.insert(users).values({ username: parsed.data.username, passwordHash, displayName: normalizeText(parsed.data.displayName), role: parsed.data.role, adminProfile: profile }).returning();
    await tx.insert(adminAuditLogs).values({ actorUserId: access.userId, actorDisplayName: access.displayName, action: parsed.data.role === "admin" ? "admin.create" : "user.create", resourceType: "user", resourceId: String(created.id), targetUserId: created.id, metadata: JSON.stringify({ role: created.role, adminProfile: created.adminProfile }) });
    return created;
  });
  return NextResponse.json({ user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role, adminProfile: user.adminProfile } });
}
