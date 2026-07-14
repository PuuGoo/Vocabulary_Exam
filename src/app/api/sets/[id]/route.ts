import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { vocabSets, words, wordProgress } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { normalizeText } from "@/lib/text";

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
  const patch = { ...parsed.data, ...(parsed.data.name ? { name: normalizeText(parsed.data.name) } : {}) };

  await db.update(vocabSets).set(patch).where(eq(vocabSets.id, setId));
  const updated = await db.query.vocabSets.findFirst({ where: eq(vocabSets.id, setId) });
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
