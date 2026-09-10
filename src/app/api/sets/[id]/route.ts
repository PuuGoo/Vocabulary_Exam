import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { classMembers, vocabCategories, vocabSets, words, wordProgress } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { normalizeText } from "@/lib/text";
import { formatCategorySetName, getCategoryPrefixNumber, nextCategoryOrder, prepareCategorySetRename } from "@/lib/categorySequence";
import { getAdminAccess, isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { writeAdminAudit } from "@/lib/adminAudit";
import { serializeLanguageSettings } from "@/lib/languageSettings";
import { findVisibleFolderIdByLegacyPath, getFolderDisplayPath, getFolderLegacyPath, requireAdminResourceAccess } from "@/lib/folderAuthorization";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const setId = Number(params.id);
  const set = await db.query.vocabSets.findFirst({ where: eq(vocabSets.id, setId) });
  if (!set) return NextResponse.json({ error: "Không tìm thấy bộ từ vựng." }, { status: 404 });
  let displayCategory = set.category;
  if (session.role === "admin") {
    const admin = await getAdminAccess(session);
    if (!admin?.can("vocab.view")) return NextResponse.json({ error: "Forbidden", code: "ADMIN_PERMISSION_REQUIRED", permission: "vocab.view" }, { status: 403 });
    const scoped = await requireAdminResourceAccess({ permission: "vocab.view", folderId: set.folderId, level: "viewer", access: admin });
    if (isAuthorizationError(scoped)) return scoped;
    if (set.folderId) displayCategory = await getFolderDisplayPath(admin, set.folderId);
  } else {
    const memberships = await db.select({ classId: classMembers.classId }).from(classMembers).where(eq(classMembers.userId, session.userId));
    if (set.publicationStatus !== "published" || (set.classId !== null && !memberships.some((item) => item.classId === set.classId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const wordList = await db.select().from(words).where(eq(words.setId, setId)).orderBy(asc(words.position), asc(words.id));

  const progress: Record<number, boolean> = {};
  if (wordList.length > 0) {
    const progressRows = await db
      .select({ wordId: wordProgress.wordId, known: wordProgress.known })
      .from(wordProgress)
      .where(
        and(
          eq(wordProgress.userId, session.userId),
          inArray(wordProgress.wordId, wordList.map((w) => w.id))
        )
      );
    for (const row of progressRows) progress[row.wordId] = row.known;
  }

  return NextResponse.json({ set: { ...set, legacyCategory: set.category, category: displayCategory, words: wordList }, progress });
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(256).optional(),
  category: z.string().trim().max(128).nullable().optional(),
  folderId: z.number().int().positive().optional(),
  publicationStatus: z.enum(["draft", "published"]).optional(),
  classId: z.number().int().nullable().optional(),
  languageSettings: z.unknown().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireAdminPermission("vocab.edit");
  if (isAuthorizationError(access)) return access;
  const setId = Number(params.id);
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  if (Object.keys(parsed.data).length === 0) return NextResponse.json({ error: "Không có thay đổi." }, { status: 400 });
  const currentResource = await db.query.vocabSets.findFirst({ where: eq(vocabSets.id, setId) });
  if (!currentResource) return NextResponse.json({ error: "Không tìm thấy bộ từ vựng." }, { status: 404 });
  const scoped = await requireAdminResourceAccess({ permission: "vocab.edit", folderId: currentResource.folderId, level: "editor", access });
  if (isAuthorizationError(scoped)) return scoped;
  const requestedFolderId = parsed.data.folderId ?? (parsed.data.category !== undefined && parsed.data.category ? await findVisibleFolderIdByLegacyPath(access, parsed.data.category) : currentResource.folderId);
  if (parsed.data.category && !requestedFolderId) return NextResponse.json({ error: "Không tìm thấy thư mục đích." }, { status: 404 });
  if (requestedFolderId !== currentResource.folderId) {
    if (!access.can("vocab.move")) return NextResponse.json({ error: "Forbidden", code: "ADMIN_PERMISSION_REQUIRED", permission: "vocab.move" }, { status: 403 });
    const target = await requireAdminResourceAccess({ permission: "vocab.move", folderId: requestedFolderId, level: "editor", access });
    if (isAuthorizationError(target)) return target;
  }
  const currentForSettings = parsed.data.languageSettings !== undefined ? await db.query.vocabSets.findFirst({ where: eq(vocabSets.id, setId) }) : null;
  let serializedSettings: string | undefined;
  if (parsed.data.languageSettings !== undefined) {
    if (!currentForSettings) return NextResponse.json({ error: "Không tìm thấy bộ từ vựng." }, { status: 404 });
    try { serializedSettings = serializeLanguageSettings(parsed.data.languageSettings, currentForSettings.languageCode); }
    catch { return NextResponse.json({ error: "Cấu hình ngôn ngữ không hợp lệ." }, { status: 400 }); }
  }
  const { languageSettings: _settings, ...basicPatch } = parsed.data;
  const folderCategory = requestedFolderId !== currentResource.folderId || parsed.data.category !== undefined ? await getFolderLegacyPath(requestedFolderId!) : undefined;
  const patch = {
    ...basicPatch,
    ...(serializedSettings !== undefined ? { languageSettings: serializedSettings } : {}),
    ...(parsed.data.name ? { name: normalizeText(parsed.data.name) } : {}),
    ...(parsed.data.category !== undefined ? { category: parsed.data.category ? normalizeText(parsed.data.category) : null } : {}),
    ...(folderCategory !== undefined ? { category: folderCategory } : {}),
    ...(requestedFolderId !== currentResource.folderId ? { folderId: requestedFolderId } : {}),
  };

  const updated = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(vocabSets).where(eq(vocabSets.id, setId)).limit(1);
    if (!current) return null;
    const nextCategory = patch.category === undefined ? current.category : patch.category;
    const categoryChanged = nextCategory !== current.category;
    if (patch.name && !categoryChanged && current.category) {
      patch.name = prepareCategorySetRename(current.name, patch.name);
    }
    if (categoryChanged && nextCategory) {
      patch.name = formatCategorySetName(await nextCategoryOrder(tx, nextCategory), patch.name || current.name);
    }
    const finalName = patch.name || current.name;
    const prefixNumber = nextCategory ? getCategoryPrefixNumber(finalName) : null;
    if (nextCategory && prefixNumber !== null) {
      const [duplicate] = await tx
        .select({ id: vocabSets.id })
        .from(vocabSets)
        .where(and(
          eq(vocabSets.category, nextCategory),
          ne(vocabSets.id, current.id),
          sql`${vocabSets.name} ~ '^[0-9]+_' and cast(substring(${vocabSets.name} from '^[0-9]+') as integer) = ${prefixNumber}`
        ))
        .limit(1);
      if (duplicate) return { conflict: true as const, prefixNumber, category: nextCategory };
    }
    if (patch.category) {
      await tx.insert(vocabCategories).values({ name: patch.category, createdBy: access.userId }).onConflictDoNothing({ target: vocabCategories.name });
    }
    await tx.update(vocabSets).set(patch).where(eq(vocabSets.id, setId));
    return { set: await tx.query.vocabSets.findFirst({ where: eq(vocabSets.id, setId) }) };
  });
  if (!updated) return NextResponse.json({ error: "Không tìm thấy bộ từ vựng." }, { status: 404 });
  if ("conflict" in updated) {
    return NextResponse.json({
      error: `Số thứ tự ${String(updated.prefixNumber).padStart(2, "0")} đã được dùng trong danh mục “${updated.category}”.`,
    }, { status: 409 });
  }
  const responseSet = updated.set;
  if (parsed.data.publicationStatus !== undefined && parsed.data.publicationStatus !== currentResource.publicationStatus) {
    await writeAdminAudit({ actorUserId: access.userId, action: "publication.change", resourceType: "vocab_set", resourceId: setId, metadata: { before: currentResource.publicationStatus, after: parsed.data.publicationStatus } });
  }
  if (requestedFolderId !== currentResource.folderId) {
    await writeAdminAudit({ actorUserId: access.userId, action: "resource.move", resourceType: "vocab_set", resourceId: setId, metadata: { beforeFolderId: currentResource.folderId, afterFolderId: requestedFolderId } });
  }
  return NextResponse.json({ set: responseSet?.folderId ? { ...responseSet, legacyCategory: responseSet.category, category: await getFolderDisplayPath(access, responseSet.folderId) } : responseSet });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireAdminPermission("vocab.delete");
  if (isAuthorizationError(access)) return access;
  const setId = Number(params.id);
  const set = await db.query.vocabSets.findFirst({ where: eq(vocabSets.id, setId) });
  if (!set) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const scoped = await requireAdminResourceAccess({ permission: "vocab.delete", folderId: set.folderId, level: "manager", access });
  if (isAuthorizationError(scoped)) return scoped;
  await db.delete(vocabSets).where(eq(vocabSets.id, setId));
  await writeAdminAudit({ actorUserId: access.userId, action: "vocab.set.delete", resourceType: "vocab_set", resourceId: setId });
  return NextResponse.json({ ok: true });
}
