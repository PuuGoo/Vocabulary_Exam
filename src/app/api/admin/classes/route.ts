import { NextRequest, NextResponse } from "next/server";
import { sql, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { classes, classMembers } from "@/db/schema";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { normalizeText } from "@/lib/text";

export async function GET() {
  const access = await requireAdminPermission("classes.view");
  if (isAuthorizationError(access)) return access;
  const rows = await db
    .select({
      id: classes.id,
      name: classes.name,
      createdAt: classes.createdAt,
      memberCount: sql<number>`count(${classMembers.id})::int`,
    })
    .from(classes)
    .leftJoin(classMembers, eq(classMembers.classId, classes.id))
    .groupBy(classes.id)
    .orderBy(classes.createdAt);
  return NextResponse.json({ classes: rows });
}

const schema = z.object({ name: z.string().trim().min(1).max(256) });

export async function POST(req: NextRequest) {
  const access = await requireAdminPermission("classes.create");
  if (isAuthorizationError(access)) return access;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Vui lòng nhập tên lớp." }, { status: 400 });

  const [row] = await db.insert(classes).values({ name: normalizeText(parsed.data.name), createdBy: access.userId }).returning();
  return NextResponse.json({ class: row });
}
