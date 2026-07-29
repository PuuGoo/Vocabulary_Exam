import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { vocabCategories, vocabSets, words, wordProgress } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { normalizeText } from "@/lib/text";
import { formatCategorySetName, hasCategoryPrefix, nextCategoryOrder, removeCategoryPrefix } from "@/lib/categorySequence";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const setId = Number(params.id);
  const set = await db.query.vocabSets.findFirst({ where: eq(vocabSets.id, setId) });
  if (!set) return NextResponse.json({ error: "Không tìm thấy bộ từ vựng." }, { status: 404 });

  const wordList = await db.select().from(words).where(eq(words.setId, setId)).orderBy(words.id);

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

  return NextResponse.json({ set: { ...set, words: wordList }, progress });
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(256).optional(),
  category: z.string().trim().max(128).nullable().optional(),
  classId: z.number().int().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const setId = Number(params.id);
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  if (Object.keys(parsed.data).length === 0) return NextResponse.json({ error: "Không có thay đổi." }, { status: 400 });
  const patch = {
    ...parsed.data,
    ...(parsed.data.name ? { name: normalizeText(parsed.data.name) } : {}),
    ...(parsed.data.category !== undefined ? { category: parsed.data.category ? normalizeText(parsed.data.category) : null } : {}),
  };

  const updated = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(vocabSets).where(eq(vocabSets.id, setId)).limit(1);
    if (!current) return null;
    const nextCategory = patch.category === undefined ? current.category : patch.category;
    const categoryChanged = nextCategory !== current.category;
    if (patch.name && !categoryChanged && current.category) {
      const currentPrefix = current.name.match(/^\d+_/)?.[0];
      patch.name = currentPrefix ? `${currentPrefix}${removeCategoryPrefix(patch.name)}` : patch.name;
    }
    if (categoryChanged && nextCategory) {
      patch.name = formatCategorySetName(await nextCategoryOrder(tx, nextCategory), patch.name || current.name);
    }
    if (patch.category) {
      await tx.insert(vocabCategories).values({ name: patch.category, createdBy: session.userId }).onConflictDoNothing({ target: vocabCategories.name });
    }
    await tx.update(vocabSets).set(patch).where(eq(vocabSets.id, setId));
    return tx.query.vocabSets.findFirst({ where: eq(vocabSets.id, setId) });
  });
  if (!updated) return NextResponse.json({ error: "Không tìm thấy bộ từ vựng." }, { status: 404 });
  return NextResponse.json({ set: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const setId = Number(params.id);
  await db.delete(vocabSets).where(eq(vocabSets.id, setId));
  return NextResponse.json({ ok: true });
}
