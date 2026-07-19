import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { studySessions, words } from "@/db/schema";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db
    .select({
      id: studySessions.id,
      setId: studySessions.setId,
      wordId: studySessions.wordId,
      position: studySessions.position,
      updatedAt: studySessions.updatedAt,
    })
    .from(studySessions)
    .where(eq(studySessions.userId, session.userId))
    .orderBy(desc(studySessions.updatedAt));
  return NextResponse.json({ sessions: rows });
}

const saveSchema = z.object({
  setId: z.number().int().positive(),
  wordId: z.number().int().positive(),
  position: z.number().int().positive(),
});

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = saveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });

  const word = await db.query.words.findFirst({
    where: and(eq(words.id, parsed.data.wordId), eq(words.setId, parsed.data.setId)),
  });
  if (!word) return NextResponse.json({ error: "Từ không thuộc bộ từ này." }, { status: 400 });

  const [saved] = await db
    .insert(studySessions)
    .values({ userId: session.userId, ...parsed.data })
    .onConflictDoUpdate({
      target: [studySessions.userId, studySessions.setId],
      set: { wordId: parsed.data.wordId, position: parsed.data.position, updatedAt: new Date() },
    })
    .returning();
  return NextResponse.json({ session: saved });
}
