import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { wordBookmarks } from "@/db/schema";
import { getSession } from "@/lib/auth";

const noteSchema = z.object({ note: z.string().max(2000) });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = noteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ghi chú không hợp lệ." }, { status: 400 });

  const [bookmark] = await db
    .update(wordBookmarks)
    .set({ note: parsed.data.note.trim(), updatedAt: new Date() })
    .where(and(eq(wordBookmarks.id, Number(params.id)), eq(wordBookmarks.userId, session.userId)))
    .returning();
  if (!bookmark) return NextResponse.json({ error: "Không tìm thấy từ đã lưu." }, { status: 404 });
  return NextResponse.json({ bookmark });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [deleted] = await db
    .delete(wordBookmarks)
    .where(and(eq(wordBookmarks.id, Number(params.id)), eq(wordBookmarks.userId, session.userId)))
    .returning({ id: wordBookmarks.id });
  if (!deleted) return NextResponse.json({ error: "Không tìm thấy từ đã lưu." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
