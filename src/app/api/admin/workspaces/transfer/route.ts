import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { adminAuditLogs, contentFolders, users } from "@/db/schema";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";

const schema = z.object({ workspaceId: z.number().int().positive(), targetAdminId: z.number().int().positive() });
export async function POST(request: NextRequest) {
  const access = await requireAdminPermission("folders.view_all"); if (isAuthorizationError(access)) return access;
  if (access.profile !== "owner") return NextResponse.json({ error: "Chỉ Owner hệ thống được chuyển quyền sở hữu workspace." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Dữ liệu chuyển workspace không hợp lệ." }, { status: 400 });
  const result = await db.transaction(async (tx) => {
    const [source] = await tx.select().from(contentFolders).where(and(eq(contentFolders.id, parsed.data.workspaceId), eq(contentFolders.kind, "personal_root"))).limit(1);
    const [targetUser] = await tx.select({ id: users.id, role: users.role, displayName: users.displayName }).from(users).where(eq(users.id, parsed.data.targetAdminId)).limit(1);
    const [targetRoot] = await tx.select().from(contentFolders).where(and(eq(contentFolders.ownerUserId, parsed.data.targetAdminId), eq(contentFolders.kind, "personal_root"))).limit(1);
    if (!source || !targetUser || targetUser.role !== "admin" || !targetRoot || source.id === targetRoot.id) return null;
    const transferredName = `Không gian được chuyển ${source.id}`;
    await tx.update(contentFolders).set({ name: transferredName, normalizedName: transferredName.toLocaleLowerCase("vi"), parentId: targetRoot.id, ownerUserId: null, kind: "folder", archivedAt: null, updatedAt: new Date() }).where(eq(contentFolders.id, source.id));
    await tx.insert(adminAuditLogs).values({ actorUserId: access.userId, actorDisplayName: access.displayName, action: "workspace.transfer", resourceType: "folder", resourceId: String(source.id), targetUserId: targetUser.id, metadata: JSON.stringify({ previousOwnerUserId: source.ownerUserId, targetAdminId: targetUser.id }) });
    return { workspaceId: source.id, targetRootId: targetRoot.id };
  });
  return result ? NextResponse.json(result) : NextResponse.json({ error: "Không thể chuyển workspace." }, { status: 409 });
}
