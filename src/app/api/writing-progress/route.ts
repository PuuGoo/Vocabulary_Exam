import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { writingProgress } from "@/db/schema";
import { getSession } from "@/lib/auth";

const schema = z.object({
  category: z.string().min(1).max(256),
  scores: z.record(z.number()).optional(),
  attempts: z.record(z.number()).optional(),
  currentIndex: z.number().int().min(0).optional(),
  elapsed: z.number().int().min(0).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });

  const d = parsed.data;
  await db
    .insert(writingProgress)
    .values({
      userId: session.userId,
      category: d.category,
      scores: JSON.stringify(d.scores ?? {}),
      attempts: JSON.stringify(d.attempts ?? {}),
      currentIndex: d.currentIndex ?? 0,
      elapsed: d.elapsed ?? 0,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [writingProgress.userId, writingProgress.category],
      set: {
        scores: JSON.stringify(d.scores ?? {}),
        attempts: JSON.stringify(d.attempts ?? {}),
        currentIndex: d.currentIndex ?? 0,
        elapsed: d.elapsed ?? 0,
        updatedAt: new Date(),
      },
    });

  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const category = url.searchParams.get("category");

  const where = [eq(writingProgress.userId, session.userId)];
  if (category) where.push(eq(writingProgress.category, category));

  const rows = await db
    .select()
    .from(writingProgress)
    .where(and(...where));

  const decoded = rows.map((row) => ({
    ...row,
    scores: safeParse(row.scores, {} as Record<number, number>),
    attempts: safeParse(row.attempts, {} as Record<number, number>),
  }));

  return NextResponse.json({ progress: decoded });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const category = url.searchParams.get("category");
  if (!category) return NextResponse.json({ error: "Thiếu tham số category." }, { status: 400 });

  await db
    .delete(writingProgress)
    .where(and(eq(writingProgress.userId, session.userId), eq(writingProgress.category, category)));

  return NextResponse.json({ ok: true });
}

function safeParse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
