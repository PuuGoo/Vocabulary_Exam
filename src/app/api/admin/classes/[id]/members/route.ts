import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { classMembers, users } from "@/db/schema";
import { getSession } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const classId = Number(params.id);
  const students = await db.select().from(users).where(eq(users.role, "student"));
  const members = await db.select().from(classMembers).where(eq(classMembers.classId, classId));
  const memberIds = new Set(members.map((m) => m.userId));
  const result = students.map((s) => ({
    id: s.id,
    username: s.username,
    displayName: s.displayName,
    isMember: memberIds.has(s.id),
  }));
  return NextResponse.json({ students: result });
}

const schema = z.object({ userId: z.number().int() });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const classId = Number(params.id);
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });

  await db
    .insert(classMembers)
    .values({ classId, userId: parsed.data.userId })
    .onConflictDoNothing();
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const classId = Number(params.id);
  const userId = Number(req.nextUrl.searchParams.get("userId"));
  if (!userId) return NextResponse.json({ error: "Thiếu userId." }, { status: 400 });
  await db.delete(classMembers).where(and(eq(classMembers.classId, classId), eq(classMembers.userId, userId)));
  return NextResponse.json({ ok: true });
}
