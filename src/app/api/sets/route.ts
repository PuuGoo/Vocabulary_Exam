import { NextRequest, NextResponse } from "next/server";
import { sql, eq, or, isNull, inArray } from "drizzle-orm";
import { db } from "@/db";
import { vocabSets, words, classMembers, classes } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { normalizeText } from "@/lib/text";
import { z } from "zod";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let classFilter;
  if (session.role !== "admin") {
    const memberships = await db
      .select({ classId: classMembers.classId })
      .from(classMembers)
      .where(eq(classMembers.userId, session.userId));
    const classIds = memberships.map((m) => m.classId);
    classFilter = classIds.length > 0 ? or(isNull(vocabSets.classId), inArray(vocabSets.classId, classIds)) : isNull(vocabSets.classId);
  }

  const query = db
    .select({
      id: vocabSets.id,
      name: vocabSets.name,
      type: vocabSets.type,
      classId: vocabSets.classId,
      className: classes.name,
      createdAt: vocabSets.createdAt,
      count: sql<number>`count(distinct ${words.id})::int`,
    })
    .from(vocabSets)
    .leftJoin(words, sql`${words.setId} = ${vocabSets.id}`)
    .leftJoin(classes, eq(classes.id, vocabSets.classId))
    .groupBy(vocabSets.id, classes.name)
    .orderBy(vocabSets.createdAt);

  const rows = classFilter ? await query.where(classFilter) : await query;

  return NextResponse.json({ sets: rows });
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(256),
  type: z.enum(["irregular_verb", "ielts_vocab"]),
  classId: z.number().int().nullable().optional(),
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
    .values({
      name: normalizeText(parsed.data.name),
      type: parsed.data.type,
      classId: parsed.data.classId ?? null,
      createdBy: session.userId,
    })
    .returning();
  return NextResponse.json({ set });
}
