import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { contentFolders, folderAccess, vocabSets, categoryDocuments, categoryQuestions } from "@/db/schema";
import { isAuthorizationError, requireAdminPermission, requireAnyAdminPermission } from "@/lib/adminAuthorization";
import { ensurePersonalWorkspace, getFolderAccessMap, getFolderDisplayPaths, getVisibleFolderIds, normalizeFolderName, requireAdminResourceAccess } from "@/lib/folderAuthorization";
import { writeAdminAudit } from "@/lib/adminAudit";

export async function GET() {
  const access = await requireAnyAdminPermission(["admin.dashboard.view", "vocab.view", "questions.view", "documents.view"]);
  if (isAuthorizationError(access)) return access;
  await ensurePersonalWorkspace(access.userId);
  const visibleIds = access.profile === "owner"
    ? (await db.select({ id: contentFolders.id }).from(contentFolders)).map((folder) => folder.id)
    : await getVisibleFolderIds(access);
  if (!visibleIds.length) return NextResponse.json({ folders: [], personalRootId: null, sharedRootIds: [] });
  const [folders, setCounts, documentCounts, questionCounts, explicit] = await Promise.all([
    db.select().from(contentFolders).where(access.profile === "owner" ? inArray(contentFolders.id, visibleIds) : and(inArray(contentFolders.id, visibleIds), isNull(contentFolders.archivedAt))).orderBy(asc(contentFolders.name)),
    db.select({ folderId: vocabSets.folderId, id: vocabSets.id }).from(vocabSets).where(inArray(vocabSets.folderId, visibleIds)),
    db.select({ folderId: categoryDocuments.folderId, id: categoryDocuments.id }).from(categoryDocuments).where(inArray(categoryDocuments.folderId, visibleIds)),
    db.select({ folderId: categoryQuestions.folderId, id: categoryQuestions.id }).from(categoryQuestions).where(inArray(categoryQuestions.folderId, visibleIds)),
    db.select({ folderId: folderAccess.folderId, accessLevel: folderAccess.accessLevel }).from(folderAccess).where(eq(folderAccess.userId, access.userId)),
  ]);
  const count = <T extends { folderId: number | null }>(rows: T[], folderId: number) => rows.filter((row) => row.folderId === folderId).length;
  const levelById = await getFolderAccessMap(access, folders.map((folder) => folder.id));
  const displayPaths = await getFolderDisplayPaths(access, folders.map((folder) => folder.id));
  const personal = folders.find((folder) => folder.kind === "personal_root" && folder.ownerUserId === access.userId);
  const ownedIds = new Set<number>();
  for (const folder of folders) {
    let current: typeof folder | undefined = folder;
    const seen = new Set<number>();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      if (current.id === personal?.id) { ownedIds.add(folder.id); break; }
      current = current.parentId == null ? undefined : folders.find((candidate) => candidate.id === current!.parentId);
    }
  }
  const explicitPositive = new Set(explicit.filter((rule) => rule.accessLevel !== "deny").map((rule) => rule.folderId));
  const sharedRootIds = access.profile === "owner" ? [] : folders.filter((folder) => explicitPositive.has(folder.id) && !ownedIds.has(folder.id) && !folders.some((candidate) => candidate.id !== folder.id && explicitPositive.has(candidate.id) && isDescendant(folder.id, candidate.id, folders))).map((folder) => folder.id);
  const canViewAll = access.profile === "owner" || access.can("folders.view_all");
  const allRootIds = canViewAll ? folders.filter((folder) => folder.parentId == null && folder.id !== personal?.id).map((folder) => folder.id) : [];
  return NextResponse.json({
    folders: folders.map((folder) => ({ ...folder, name: folder.kind === "personal_root" ? (folder.ownerUserId === access.userId ? "Không gian của tôi" : `Không gian #${folder.id}`) : folder.name, path: displayPaths.get(folder.id) ?? folder.name, accessLevel: levelById.get(folder.id), counts: { sets: count(setCounts, folder.id), documents: count(documentCounts, folder.id), questions: count(questionCounts, folder.id) } })),
    personalRootId: personal?.id ?? null,
    sharedRootIds,
    allRootIds,
    canViewAll,
  });
}

function isDescendant(folderId: number, ancestorId: number, folders: Array<{ id: number; parentId: number | null }>) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const seen = new Set<number>();
  let current = byId.get(folderId);
  while (current?.parentId && !seen.has(current.id)) { seen.add(current.id); if (current.parentId === ancestorId) return true; current = byId.get(current.parentId); }
  return false;
}

const createSchema = z.object({ name: z.string().min(1).max(128), parentId: z.number().int().positive().nullable().optional() });
export async function POST(request: NextRequest) {
  const global = await requireAdminPermission("folders.create");
  if (isAuthorizationError(global)) return global;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu thư mục không hợp lệ." }, { status: 400 });
  const personal = await ensurePersonalWorkspace(global.userId);
  const parentId = parsed.data.parentId ?? personal?.id;
  if (!parentId) return NextResponse.json({ error: "Không tìm thấy Không gian của tôi." }, { status: 409 });
  const scoped = await requireAdminResourceAccess({ permission: "folders.create", folderId: parentId, level: "manager", access: global });
  if (scoped instanceof NextResponse) return scoped;
  const name = normalizeFolderName(parsed.data.name);
  if (!name || name.includes("/") || name.length > 128) return NextResponse.json({ error: "Tên thư mục không hợp lệ; không dùng dấu /." }, { status: 400 });
  const [existing] = await db.select({ id: contentFolders.id }).from(contentFolders).where(and(eq(contentFolders.parentId, parentId), eq(contentFolders.normalizedName, name.toLocaleLowerCase("vi")), isNull(contentFolders.archivedAt))).limit(1);
  if (existing) return NextResponse.json({ error: "Tên thư mục đã tồn tại trong vị trí này." }, { status: 409 });
  const [folder] = await db.insert(contentFolders).values({ name, normalizedName: name.toLocaleLowerCase("vi"), parentId, kind: "folder", createdBy: global.userId }).returning();
  await writeAdminAudit({ actorUserId: global.userId, action: "folder.create", resourceType: "folder", resourceId: folder.id, metadata: { parentId, name } });
  return NextResponse.json({ folder }, { status: 201 });
}
