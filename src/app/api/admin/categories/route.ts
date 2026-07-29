import { NextRequest, NextResponse } from "next/server";
import { asc, eq, ilike, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { vocabCategories, vocabSets } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { normalizeText } from "@/lib/text";

const nameSchema = z.object({ name: z.string().trim().min(1).max(128) });

async function requireAdmin() {
  const session = await getSession();
  return session?.role === "admin" ? session : null;
}

async function findDuplicate(name: string, excludedId?: number) {
  const matches = await db.select({ id: vocabCategories.id }).from(vocabCategories).where(ilike(vocabCategories.name, name)).limit(2);
  return matches.find((item) => item.id !== excludedId);
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Register categories from older vocab sets so the manager remains compatible
  // with data created before the category registry existed.
  const legacyRows = await db
    .selectDistinct({ name: vocabSets.category })
    .from(vocabSets)
    .where(sql`${vocabSets.category} is not null and btrim(${vocabSets.category}) <> ''`);
  if (legacyRows.length) {
    await db.insert(vocabCategories)
      .values(legacyRows.map((item) => ({ name: item.name! })))
      .onConflictDoNothing({ target: vocabCategories.name });
  }

  const categories = await db
    .select({
      id: vocabCategories.id,
      name: vocabCategories.name,
      count: sql<number>`count(${vocabSets.id})::int`,
      createdAt: vocabCategories.createdAt,
    })
    .from(vocabCategories)
    .leftJoin(vocabSets, eq(vocabSets.category, vocabCategories.name))
    .groupBy(vocabCategories.id)
    .orderBy(asc(vocabCategories.name));
  return NextResponse.json({ categories });
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = nameSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Tên danh mục phải có từ 1 đến 128 ký tự." }, { status: 400 });
  const name = normalizeText(parsed.data.name);
  if (await findDuplicate(name)) return NextResponse.json({ error: "Danh mục này đã tồn tại." }, { status: 409 });
  const [category] = await db.insert(vocabCategories).values({ name, createdBy: session.userId }).returning();
  return NextResponse.json({ category }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const parsed = nameSchema.extend({ id: z.number().int().positive() }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu danh mục không hợp lệ." }, { status: 400 });
  const name = normalizeText(parsed.data.name);
  if (await findDuplicate(name, parsed.data.id)) return NextResponse.json({ error: "Danh mục này đã tồn tại." }, { status: 409 });

  const result = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(vocabCategories).where(eq(vocabCategories.id, parsed.data.id)).limit(1);
    if (!current) return null;
    await tx.update(vocabCategories).set({ name }).where(eq(vocabCategories.id, current.id));
    await tx.update(vocabSets).set({ category: name }).where(eq(vocabSets.category, current.name));
    return { ...current, name, oldName: current.name };
  });
  if (!result) return NextResponse.json({ error: "Không tìm thấy danh mục." }, { status: 404 });
  return NextResponse.json({ category: result });
}

export async function DELETE(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Danh mục không hợp lệ." }, { status: 400 });

  const result = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(vocabCategories).where(eq(vocabCategories.id, id)).limit(1);
    if (!current) return null;
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(vocabSets).where(eq(vocabSets.category, current.name));
    await tx.update(vocabSets).set({ category: null }).where(eq(vocabSets.category, current.name));
    await tx.delete(vocabCategories).where(eq(vocabCategories.id, id));
    return { name: current.name, movedSets: count };
  });
  if (!result) return NextResponse.json({ error: "Không tìm thấy danh mục." }, { status: 404 });
  return NextResponse.json(result);
}
