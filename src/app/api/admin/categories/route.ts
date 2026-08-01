import { NextRequest, NextResponse } from "next/server";
import { asc, eq, ilike, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { vocabCategories, vocabSets } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { normalizeText } from "@/lib/text";

const nameSchema = z.object({ name: z.string().trim().min(1).max(128) });
const categoryPathSchema = nameSchema.extend({ parentPath: z.string().trim().max(256).nullable().optional() });

async function requireAdmin() {
  const session = await getSession();
  return session?.role === "admin" ? session : null;
}

async function findDuplicate(name: string, excludedId?: number) {
  const matches = await db.select({ id: vocabCategories.id }).from(vocabCategories).where(ilike(vocabCategories.name, name)).limit(2);
  return matches.find((item) => item.id !== excludedId);
}

function buildPath(name: string, parentPath?: string | null) {
  const leaf = normalizeText(name).replace(/\s*\/\s*/g, "").trim();
  const parent = parentPath ? normalizeText(parentPath).replace(/\s*\/\s*/g, " / ").trim() : "";
  return parent ? `${parent} / ${leaf}` : leaf;
}

async function nextCategoryNumber(parentPath?: string | null) {
  const rows = await db.select({ name: vocabCategories.name }).from(vocabCategories);
  const prefix = parentPath ? `${parentPath} / ` : "";
  let max = 0;
  for (const row of rows) {
    if (parentPath ? !row.name.startsWith(prefix) : row.name.includes(" / ")) continue;
    const rest = parentPath ? row.name.slice(prefix.length) : row.name;
    if (rest.includes(" / ")) continue;
    const match = /^(\d+)_/.exec(rest);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
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
    .leftJoin(vocabSets, sql`${vocabSets.category} = ${vocabCategories.name} or ${vocabSets.category} like ${vocabCategories.name} || ' / %'`)
    .groupBy(vocabCategories.id)
    .orderBy(asc(vocabCategories.name));
  return NextResponse.json({ categories });
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = categoryPathSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Tên danh mục phải có từ 1 đến 128 ký tự." }, { status: 400 });
  const number = await nextCategoryNumber(parsed.data.parentPath);
  const leaf = parsed.data.name.replace(/^\d+_/, "").trim();
  const name = buildPath(`${String(number).padStart(2, "0")}_${leaf}`, parsed.data.parentPath);
  if (name.length > 128) return NextResponse.json({ error: "Đường dẫn danh mục không được vượt quá 128 ký tự." }, { status: 400 });
  if (await findDuplicate(name)) return NextResponse.json({ error: "Danh mục này đã tồn tại." }, { status: 409 });
  const [category] = await db.insert(vocabCategories).values({ name, createdBy: session.userId }).returning();
  return NextResponse.json({ category }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const parsed = nameSchema.extend({ id: z.number().int().positive() }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu danh mục không hợp lệ." }, { status: 400 });
  const result = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(vocabCategories).where(eq(vocabCategories.id, parsed.data.id)).limit(1);
    if (!current) return null;
    const parent = current.name.includes(" / ") ? current.name.slice(0, current.name.lastIndexOf(" / ")) : "";
    const currentLeaf = current.name.split(" / ").pop() || current.name;
    const currentNumber = /^(\d+)_/.exec(currentLeaf)?.[1];
    const cleanRequestedLeaf = parsed.data.name.replace(/^\d+_/, "").trim();
    const requestedLeaf = currentNumber ? `${currentNumber}_${cleanRequestedLeaf}` : cleanRequestedLeaf;
    const name = buildPath(requestedLeaf, parent || null);
    if (name.length > 128) return { tooLong: true as const };
    if (await findDuplicate(name, parsed.data.id)) return { conflict: true as const };
    const descendants = await tx.select({ id: vocabCategories.id, name: vocabCategories.name }).from(vocabCategories).where(sql`${vocabCategories.name} like ${`${current.name} / %`}`);
    await tx.update(vocabCategories).set({ name }).where(eq(vocabCategories.id, current.id));
    await tx.update(vocabSets).set({ category: name }).where(eq(vocabSets.category, current.name));
    for (const child of descendants) {
      const childName = `${name}${child.name.slice(current.name.length)}`;
      await tx.update(vocabCategories).set({ name: childName }).where(eq(vocabCategories.id, child.id));
      await tx.update(vocabSets).set({ category: childName }).where(eq(vocabSets.category, child.name));
    }
    return { ...current, name, oldName: current.name };
  });
  if (!result) return NextResponse.json({ error: "Không tìm thấy danh mục." }, { status: 404 });
  if ("tooLong" in result) return NextResponse.json({ error: "Đường dẫn danh mục không được vượt quá 128 ký tự." }, { status: 400 });
  if ("conflict" in result) return NextResponse.json({ error: "Danh mục này đã tồn tại." }, { status: 409 });
  return NextResponse.json({ category: result });
}

export async function DELETE(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Danh mục không hợp lệ." }, { status: 400 });

  const result = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(vocabCategories).where(eq(vocabCategories.id, id)).limit(1);
    if (!current) return null;
    const descendants = await tx.select({ id: vocabCategories.id, name: vocabCategories.name }).from(vocabCategories).where(sql`${vocabCategories.name} = ${current.name} or ${vocabCategories.name} like ${`${current.name} / %`}`);
    const names = descendants.map((item) => item.name);
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(vocabSets).where(sql`${vocabSets.category} in (${sql.join(names.map((name) => sql`${name}`), sql`, `)})`);
    await tx.update(vocabSets).set({ category: null }).where(sql`${vocabSets.category} in (${sql.join(names.map((name) => sql`${name}`), sql`, `)})`);
    await tx.delete(vocabCategories).where(sql`${vocabCategories.name} = ${current.name} or ${vocabCategories.name} like ${`${current.name} / %`}`);
    return { name: current.name, movedSets: count };
  });
  if (!result) return NextResponse.json({ error: "Không tìm thấy danh mục." }, { status: 404 });
  return NextResponse.json(result);
}
