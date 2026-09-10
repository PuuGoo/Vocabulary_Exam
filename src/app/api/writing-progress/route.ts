import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { categoryQuestions, writingProgress } from "@/db/schema";
import { getSession } from "@/lib/auth";

const schema = z.object({
  category: z.string().min(1).max(256),
  folderId: z.number().int().positive().optional(),
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
  const folderId = await resolvePublishedQuestionFolder(d.category, d.folderId);
  if (!folderId) return NextResponse.json({ error: "Không tìm thấy nội dung đã xuất bản." }, { status: 404 });

  await db
    .insert(writingProgress)
    .values({
      userId: session.userId,
      category: d.category,
      folderId,
      scores: JSON.stringify(d.scores ?? {}),
      attempts: JSON.stringify(d.attempts ?? {}),
      currentIndex: d.currentIndex ?? 0,
      elapsed: d.elapsed ?? 0,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [writingProgress.userId, writingProgress.folderId],
      set: {
        category: d.category,
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
  const folderId = parseFolderId(url.searchParams.get("folderId"));

  const where = [eq(writingProgress.userId, session.userId)];
  if (folderId) where.push(eq(writingProgress.folderId, folderId));
  else if (category) where.push(eq(writingProgress.category, category));

  const rows = await db.select().from(writingProgress).where(and(...where));
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
  const folderId = parseFolderId(url.searchParams.get("folderId"));
  if (!folderId && !category) return NextResponse.json({ error: "Thiếu thư mục." }, { status: 400 });

  await db.delete(writingProgress).where(and(
    eq(writingProgress.userId, session.userId),
    folderId ? eq(writingProgress.folderId, folderId) : eq(writingProgress.category, category!),
  ));

  return NextResponse.json({ ok: true });
}

function parseFolderId(value: string | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function resolvePublishedQuestionFolder(category: string, requestedFolderId?: number) {
  const conditions = [eq(categoryQuestions.publicationStatus, "published")];
  conditions.push(requestedFolderId
    ? eq(categoryQuestions.folderId, requestedFolderId)
    : eq(categoryQuestions.category, category));

  const [row] = await db
    .select({ folderId: categoryQuestions.folderId })
    .from(categoryQuestions)
    .where(and(...conditions))
    .limit(1);

  return row?.folderId ?? null;
}

function safeParse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
