import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { vocabSets, wordBookmarks, words } from "@/db/schema";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select({
      id: wordBookmarks.id,
      wordId: words.id,
      setId: vocabSets.id,
      setName: vocabSets.name,
      setType: vocabSets.type,
      meaning: words.meaning,
      term: words.term,
      v1: words.v1,
      v2: words.v2,
      v3: words.v3,
      ipa: words.ipa,
      example: words.example,
      note: wordBookmarks.note,
      createdAt: wordBookmarks.createdAt,
      updatedAt: wordBookmarks.updatedAt,
    })
    .from(wordBookmarks)
    .innerJoin(words, eq(words.id, wordBookmarks.wordId))
    .innerJoin(vocabSets, eq(vocabSets.id, words.setId))
    .where(eq(wordBookmarks.userId, session.userId))
    .orderBy(desc(wordBookmarks.updatedAt));

  return NextResponse.json({ bookmarks: rows });
}

const createSchema = z.object({ wordId: z.number().int().positive() });

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });

  const word = await db.query.words.findFirst({ where: eq(words.id, parsed.data.wordId) });
  if (!word) return NextResponse.json({ error: "Không tìm thấy từ." }, { status: 404 });

  const [bookmark] = await db
    .insert(wordBookmarks)
    .values({ userId: session.userId, wordId: parsed.data.wordId })
    .onConflictDoUpdate({
      target: [wordBookmarks.userId, wordBookmarks.wordId],
      set: { updatedAt: new Date() },
    })
    .returning();
  return NextResponse.json({ bookmark });
}
