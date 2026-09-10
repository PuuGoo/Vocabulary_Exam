import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { categoryDocuments, categoryQuestions, contentFolders, vocabSets } from "@/db/schema";
import { isAuthorizationError, requireAdminPermission, requireAnyAdminPermission } from "@/lib/adminAuthorization";
import { ensurePersonalWorkspace, getFolderDisplayPaths, getVisibleFolderIds, normalizeFolderName, requireAdminResourceAccess } from "@/lib/folderAuthorization";
import { writeAdminAudit } from "@/lib/adminAudit";

const inputSchema = z.object({ id: z.number().int().positive().optional(), name: z.string().min(1).max(128), parentId: z.number().int().positive().nullable().optional(), parentPath: z.string().max(256).nullable().optional() });

export async function GET() {
  const access = await requireAnyAdminPermission(["vocab.view", "questions.view", "documents.view"]); if (isAuthorizationError(access)) return access;
  await ensurePersonalWorkspace(access.userId);
  const ids = await getVisibleFolderIds(access);
  if (!ids.length) return NextResponse.json({ categories: [] });
  const [folders, sets, documents, questions] = await Promise.all([
    db.select().from(contentFolders).where(and(inArray(contentFolders.id, ids), isNull(contentFolders.archivedAt))),
    db.select({ id: vocabSets.id, folderId: vocabSets.folderId }).from(vocabSets).where(inArray(vocabSets.folderId, ids)),
    db.select({ id: categoryDocuments.id, folderId: categoryDocuments.folderId }).from(categoryDocuments).where(inArray(categoryDocuments.folderId, ids)),
    db.select({ id: categoryQuestions.id, folderId: categoryQuestions.folderId }).from(categoryQuestions).where(inArray(categoryQuestions.folderId, ids)),
  ]);
  const paths = await getFolderDisplayPaths(access, folders.map((folder) => folder.id));
  const categories = folders.map((folder) => ({
    id: folder.id, folderId: folder.id, parentId: folder.parentId, kind: folder.kind,
    name: paths.get(folder.id) ?? folder.name,
    leafName: folder.ownerUserId === access.userId && folder.kind === "personal_root" ? "Không gian của tôi" : folder.name,
    count: sets.filter((row) => row.folderId === folder.id).length,
    documentCount: documents.filter((row) => row.folderId === folder.id).length,
    questionCount: questions.filter((row) => row.folderId === folder.id).length,
    createdAt: folder.createdAt,
  }));
  return NextResponse.json({ categories });
}

async function resolveParent(access: Exclude<Awaited<ReturnType<typeof requireAdminPermission>>, NextResponse>, input: { parentId?: number | null; parentPath?: string | null }) {
  if (input.parentId) return db.query.contentFolders.findFirst({ where: eq(contentFolders.id, input.parentId) });
  if (!input.parentPath) return ensurePersonalWorkspace(access.userId);
  const ids = await getVisibleFolderIds(access); const paths = await getFolderDisplayPaths(access, ids);
  for (const id of ids) if (paths.get(id) === input.parentPath) return db.query.contentFolders.findFirst({ where: eq(contentFolders.id, id) });
  return null;
}

export async function POST(request: NextRequest) {
  const access = await requireAdminPermission("folders.create"); if (isAuthorizationError(access)) return access;
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Tên thư mục không hợp lệ." }, { status: 400 });
  const parent = await resolveParent(access, parsed.data);
  const scoped = await requireAdminResourceAccess({ permission: "folders.create", folderId: parent?.id, level: "manager", access }); if (isAuthorizationError(scoped)) return scoped;
  const name = normalizeFolderName(parsed.data.name);
  if (!name || name.includes("/")) return NextResponse.json({ error: "Tên thư mục không hợp lệ; không dùng dấu /." }, { status: 400 });
  const normalizedName = name.toLocaleLowerCase("vi");
  const [duplicate] = await db.select({ id: contentFolders.id }).from(contentFolders).where(and(eq(contentFolders.parentId, parent!.id), eq(contentFolders.normalizedName, normalizedName), isNull(contentFolders.archivedAt))).limit(1);
  if (duplicate) return NextResponse.json({ error: "Danh mục này đã tồn tại." }, { status: 409 });
  const [folder] = await db.insert(contentFolders).values({ name, normalizedName, parentId: parent!.id, kind: "folder", createdBy: access.userId }).returning();
  await writeAdminAudit({ actorUserId: access.userId, action: "folder.create", resourceType: "folder", resourceId: folder.id, metadata: { parentId: parent!.id, name } });
  return NextResponse.json({ category: { ...folder, folderId: folder.id, name: (await getFolderDisplayPaths(access, [folder.id])).get(folder.id) } }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const access = await requireAdminPermission("folders.rename"); if (isAuthorizationError(access)) return access;
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !parsed.data.id) return NextResponse.json({ error: "Dữ liệu thư mục không hợp lệ." }, { status: 400 });
  const scoped = await requireAdminResourceAccess({ permission: "folders.rename", folderId: parsed.data.id, level: "manager", access }); if (isAuthorizationError(scoped)) return scoped;
  const [current] = await db.select().from(contentFolders).where(eq(contentFolders.id, parsed.data.id)).limit(1);
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (current.kind !== "folder") return NextResponse.json({ error: "Không thể đổi tên thư mục gốc." }, { status: 409 });
  const name = normalizeFolderName(parsed.data.name); if (!name || name.includes("/")) return NextResponse.json({ error: "Tên thư mục không hợp lệ." }, { status: 400 });
  const [folder] = await db.update(contentFolders).set({ name, normalizedName: name.toLocaleLowerCase("vi"), updatedAt: new Date() }).where(eq(contentFolders.id, current.id)).returning();
  await writeAdminAudit({ actorUserId: access.userId, action: "folder.rename", resourceType: "folder", resourceId: folder.id, metadata: { before: current.name, after: name } });
  return NextResponse.json({ category: { ...folder, folderId: folder.id, name: (await getFolderDisplayPaths(access, [folder.id])).get(folder.id) } });
}

export async function DELETE(request: NextRequest) {
  const access = await requireAdminPermission("folders.delete"); if (isAuthorizationError(access)) return access;
  const id = Number(request.nextUrl.searchParams.get("id"));
  const scoped = await requireAdminResourceAccess({ permission: "folders.delete", folderId: id, level: "manager", access }); if (isAuthorizationError(scoped)) return scoped;
  const [current] = await db.select().from(contentFolders).where(eq(contentFolders.id, id)).limit(1);
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (current.kind !== "folder") return NextResponse.json({ error: "Không thể xóa thư mục gốc." }, { status: 409 });
  const [child] = await db.select({ id: contentFolders.id }).from(contentFolders).where(and(eq(contentFolders.parentId, id), isNull(contentFolders.archivedAt))).limit(1);
  const occupied = (await Promise.all([db.select({ id: vocabSets.id }).from(vocabSets).where(eq(vocabSets.folderId, id)).limit(1), db.select({ id: categoryQuestions.id }).from(categoryQuestions).where(eq(categoryQuestions.folderId, id)).limit(1), db.select({ id: categoryDocuments.id }).from(categoryDocuments).where(eq(categoryDocuments.folderId, id)).limit(1)])).some((rows) => rows.length);
  if (child || occupied) return NextResponse.json({ error: "Thư mục còn nội dung. Hãy di chuyển nội dung trước khi lưu trữ." }, { status: 409 });
  await db.update(contentFolders).set({ archivedAt: new Date(), updatedAt: new Date() }).where(eq(contentFolders.id, id));
  await writeAdminAudit({ actorUserId: access.userId, action: "folder.delete", resourceType: "folder", resourceId: id });
  return NextResponse.json({ ok: true, archived: true });
}
