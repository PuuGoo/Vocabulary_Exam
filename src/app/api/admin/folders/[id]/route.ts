import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { contentFolders } from "@/db/schema";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { normalizeFolderName, requireAdminResourceAccess } from "@/lib/folderAuthorization";
import { writeAdminAudit } from "@/lib/adminAudit";

const patchSchema = z.object({ name: z.string().min(1).max(128).optional(), parentId: z.number().int().positive().nullable().optional(), archived: z.boolean().optional(), confirmAccessChange: z.boolean().optional() });

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const folderId = Number(params.id);
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!Number.isInteger(folderId) || !parsed.success) return NextResponse.json({ error: "Dữ liệu thư mục không hợp lệ." }, { status: 400 });
  const permission = parsed.data.archived !== undefined ? "folders.delete" : parsed.data.parentId !== undefined ? "folders.move" : "folders.rename";
  const global = await requireAdminPermission(permission);
  if (isAuthorizationError(global)) return global;
  const scoped = await requireAdminResourceAccess({ permission, folderId, level: "manager", access: global });
  if (scoped instanceof NextResponse) return scoped;
  const folders = await db.select().from(contentFolders);
  const current = folders.find((folder) => folder.id === folderId);
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (current.kind === "personal_root") return NextResponse.json({ error: "Không thể đổi, di chuyển hoặc xóa Không gian của tôi." }, { status: 409 });
  const update: Partial<typeof contentFolders.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) {
    const name = normalizeFolderName(parsed.data.name);
    if (!name || name.includes("/")) return NextResponse.json({ error: "Tên thư mục không hợp lệ." }, { status: 400 });
    update.name = name; update.normalizedName = name.toLocaleLowerCase("vi");
  }
  if (parsed.data.parentId !== undefined) {
    if (!parsed.data.parentId) return NextResponse.json({ error: "Thư mục thường phải có thư mục cha." }, { status: 400 });
    const target = await requireAdminResourceAccess({ permission: "folders.move", folderId: parsed.data.parentId, level: "manager", access: global });
    if (target instanceof NextResponse) return target;
    let node = folders.find((folder) => folder.id === parsed.data.parentId); let depth = 1;
    while (node) { if (node.id === folderId) return NextResponse.json({ error: "Không thể di chuyển thư mục vào chính cây con của nó." }, { status: 409 }); node = node.parentId ? folders.find((folder) => folder.id === node!.parentId) : undefined; if (++depth > 20) return NextResponse.json({ error: "Cây thư mục vượt quá độ sâu cho phép." }, { status: 409 }); }
    if (!parsed.data.confirmAccessChange) return NextResponse.json({ error: "Việc di chuyển có thể thay đổi quyền kế thừa.", code: "FOLDER_ACCESS_CHANGE_CONFIRMATION_REQUIRED" }, { status: 409 });
    update.parentId = parsed.data.parentId;
  }
  if (parsed.data.archived !== undefined) update.archivedAt = parsed.data.archived ? new Date() : null;
  const [conflict] = update.normalizedName ? await db.select({ id: contentFolders.id }).from(contentFolders).where(and(eq(contentFolders.parentId, update.parentId ?? current.parentId!), eq(contentFolders.normalizedName, update.normalizedName), isNull(contentFolders.archivedAt))).limit(1) : [];
  if (conflict && conflict.id !== folderId) return NextResponse.json({ error: "Tên thư mục đã tồn tại trong vị trí này." }, { status: 409 });
  const [folder] = await db.update(contentFolders).set(update).where(eq(contentFolders.id, folderId)).returning();
  await writeAdminAudit({ actorUserId: global.userId, action: parsed.data.archived !== undefined ? (parsed.data.archived ? "folder.delete" : "folder.restore") : parsed.data.parentId !== undefined ? "folder.move" : "folder.rename", resourceType: "folder", resourceId: folderId, metadata: { before: current, after: folder } });
  return NextResponse.json({ folder });
}
