import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { folderAccess, users } from "@/db/schema";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { isFolderAccessLevel } from "@/lib/folderAuthorizationCore";
import { requireAdminResourceAccess } from "@/lib/folderAuthorization";
import { writeAdminAudit } from "@/lib/adminAudit";

const schema = z.object({ userId: z.number().int().positive(), accessLevel: z.string().nullable() });
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const folderId = Number(params.id);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!Number.isInteger(folderId) || !parsed.success || (parsed.data.accessLevel !== null && !isFolderAccessLevel(parsed.data.accessLevel))) return NextResponse.json({ error: "Dữ liệu quyền thư mục không hợp lệ." }, { status: 400 });
  const global = await requireAdminPermission("folders.share"); if (isAuthorizationError(global)) return global;
  const scoped = await requireAdminResourceAccess({ permission: "folders.share", folderId, level: "manager", access: global }); if (scoped instanceof NextResponse) return scoped;
  const [target] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, parsed.data.userId)).limit(1);
  if (!target || target.role !== "admin") return NextResponse.json({ error: "Chỉ có thể cấp quyền cho quản trị viên." }, { status: 400 });
  const [before] = await db.select().from(folderAccess).where(and(eq(folderAccess.folderId, folderId), eq(folderAccess.userId, target.id))).limit(1);
  if (parsed.data.accessLevel === null) await db.delete(folderAccess).where(and(eq(folderAccess.folderId, folderId), eq(folderAccess.userId, target.id)));
  else await db.insert(folderAccess).values({ folderId, userId: target.id, accessLevel: parsed.data.accessLevel, grantedBy: global.userId }).onConflictDoUpdate({ target: [folderAccess.folderId, folderAccess.userId], set: { accessLevel: parsed.data.accessLevel, grantedBy: global.userId, updatedAt: new Date() } });
  await writeAdminAudit({ actorUserId: global.userId, action: parsed.data.accessLevel === null ? "folder.access.revoke" : before ? "folder.access.change" : "folder.access.grant", resourceType: "folder", resourceId: folderId, targetUserId: target.id, metadata: { before: before?.accessLevel ?? null, after: parsed.data.accessLevel } });
  return NextResponse.json({ ok: true });
}
