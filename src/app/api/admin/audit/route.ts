import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs, users } from "@/db/schema";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";

export async function GET(request: NextRequest) {
  const access = await requireAdminPermission("audit.view");
  if (isAuthorizationError(access)) return access;
  const query = request.nextUrl.searchParams.get("q")?.trim();
  const action = request.nextUrl.searchParams.get("action")?.trim();
  const filters = [action ? eq(adminAuditLogs.action, action) : undefined, query ? or(ilike(adminAuditLogs.action, `%${query}%`), ilike(adminAuditLogs.resourceType, `%${query}%`), ilike(users.displayName, `%${query}%`)) : undefined].filter((item): item is NonNullable<typeof item> => Boolean(item));
  const rows = await db.select({ id: adminAuditLogs.id, actorUserId: adminAuditLogs.actorUserId, actorDisplayName: adminAuditLogs.actorDisplayName, currentActorName: users.displayName, action: adminAuditLogs.action, resourceType: adminAuditLogs.resourceType, resourceId: adminAuditLogs.resourceId, targetUserId: adminAuditLogs.targetUserId, metadata: adminAuditLogs.metadata, createdAt: adminAuditLogs.createdAt }).from(adminAuditLogs).leftJoin(users, eq(users.id, adminAuditLogs.actorUserId)).where(filters.length ? and(...filters) : undefined).orderBy(desc(adminAuditLogs.createdAt)).limit(200);
  return NextResponse.json({ logs: rows });
}
