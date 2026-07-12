import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { vocabSets, words } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { z } from "zod";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select({
      id: vocabSets.id,
      name: vocabSets.name,
      type: vocabSets.type,
      createdAt: vocabSets.createdAt,
      count: sql<number>`count(${words.id})::int`,
    })
    .from(vocabSets)
    .leftJoin(words, sql`${words.setId} = ${vocabSets.id}`)
    .groupBy(vocabSets.id)
    .orderBy(vocabSets.createdAt);

  return NextResponse.json({ sets: rows });
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(256),
  type: z.enum(["irregular_verb", "ielts_vocab"]),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const [set] = await db
    .insert(vocabSets)
    .values({ name: parsed.data.name, type: parsed.data.type, createdBy: session.userId })
    .returning();
  return NextResponse.json({ set });
}
