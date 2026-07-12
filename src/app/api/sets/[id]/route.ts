import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { vocabSets, words } from "@/db/schema";
import { getSession } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const setId = Number(params.id);
  const set = await db.query.vocabSets.findFirst({ where: eq(vocabSets.id, setId) });
  if (!set) return NextResponse.json({ error: "Không tìm thấy bộ từ vựng." }, { status: 404 });

  const wordList = await db.select().from(words).where(eq(words.setId, setId)).orderBy(words.id);
  return NextResponse.json({ set: { ...set, words: wordList } });
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
