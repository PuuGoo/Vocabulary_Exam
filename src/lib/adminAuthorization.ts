import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminPermissionOverrides, users } from "@/db/schema";
import { getSession, type SessionPayload } from "@/lib/auth";
import { isAdminPermission, isAdminProfile, resolveAdminPermissions, type AdminPermission, type AdminProfile } from "@/lib/adminPermissions";

export type AdminAccess = {
  userId: number;
  username: string;
  displayName: string;
  profile: AdminProfile;
  permissions: Set<AdminPermission>;
  can(permission: AdminPermission): boolean;
};

export function adminPermissionError(permission?: AdminPermission, status = 403) {
  return NextResponse.json({ error: status === 401 ? "Unauthorized" : "Forbidden", code: "ADMIN_PERMISSION_REQUIRED", ...(permission ? { permission } : {}) }, { status });
}

export async function getAdminAccess(session?: SessionPayload | null): Promise<AdminAccess | null> {
  const currentSession = session === undefined ? await getSession() : session;
  if (!currentSession) return null;
  const [user] = await db.select({ id: users.id, username: users.username, displayName: users.displayName, role: users.role, adminProfile: users.adminProfile }).from(users).where(eq(users.id, currentSession.userId)).limit(1);
  if (!user || user.role !== "admin") return null;
  // The manager fallback only covers the short deploy window before the additive migration runs.
  const profile: AdminProfile = isAdminProfile(user.adminProfile) ? user.adminProfile : "manager";
  const overrides = profile === "owner" ? [] : await db.select({ permission: adminPermissionOverrides.permission, allowed: adminPermissionOverrides.allowed }).from(adminPermissionOverrides).where(eq(adminPermissionOverrides.userId, user.id));
  const permissions = resolveAdminPermissions(profile, overrides);
  return { userId: user.id, username: user.username, displayName: user.displayName, profile, permissions, can: (permission) => isAdminPermission(permission) && permissions.has(permission) };
}

export async function requireAdminPermission(permission: AdminPermission): Promise<AdminAccess | NextResponse> {
  if (!isAdminPermission(permission)) return adminPermissionError(undefined);
  const session = await getSession();
  if (!session) return adminPermissionError(permission, 401);
  const access = await getAdminAccess(session);
  if (!access || !access.can(permission)) return adminPermissionError(permission);
  return access;
}

export async function requireAnyAdminPermission(required: readonly AdminPermission[]): Promise<AdminAccess | NextResponse> {
  const session = await getSession();
  if (!session) return adminPermissionError(required[0], 401);
  const access = await getAdminAccess(session);
  if (!access || !required.some((permission) => access.can(permission))) return adminPermissionError(required[0]);
  return access;
}

export function isAuthorizationError(value: AdminAccess | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}
