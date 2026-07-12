import { NextRequest, NextResponse } from "next/server";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { attempts, mistakes } from "@/db/schema";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select()
    .from(attempts)
    .where(eq(attempts.userId, session.userId))
    .orderBy(desc(attempts.createdAt));
  return NextResponse.json({ results: rows });
}

const schema = z.object({
  setId: z.number().int(),
  setName: z.string().min(1),
  mode: z.enum(["fill", "mc"]),
  score: z.number().int().min(0),
  total: z.number().int().min(0),
  durationSeconds: z.number().int().min(0).optional(),
  timed: z.boolean().optional(),
  wrongWordIds: z.array(z.number().int()).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });

  const { wrongWordIds, ...attemptData } = parsed.data;

  const [row] = await db
    .insert(attempts)
    .values({ userId: session.userId, ...attemptData })
    .returning();

  if (wrongWordIds && wrongWordIds.length > 0) {
    for (const wordId of wrongWordIds) {
      await db
        .insert(mistakes)
        .values({ userId: session.userId, wordId, setId: parsed.data.setId, timesWrong: 1, lastWrongAt: new Date() })
        .onConflictDoUpdate({
          target: [mistakes.userId, mistakes.wordId],
          set: { timesWrong: sql`${mistakes.timesWrong} + 1`, lastWrongAt: new Date() },
        });
    }
  }

  return NextResponse.json({ result: row });
}
