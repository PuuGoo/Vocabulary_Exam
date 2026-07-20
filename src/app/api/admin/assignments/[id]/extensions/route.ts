import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { assignmentExtensions, assignments, classMembers } from "@/db/schema";
import { getSession } from "@/lib/auth";

const schema = z.object({ userId: z.number().int().positive(), dueAt: z.string().datetime() });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const assignmentId = Number(params.id);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!Number.isInteger(assignmentId) || assignmentId < 1 || !parsed.success) return NextResponse.json({ error: "Dữ liệu gia hạn không hợp lệ." }, { status: 400 });
  const assignment = await db.query.assignments.findFirst({ where: eq(assignments.id, assignmentId) });
  if (!assignment) return NextResponse.json({ error: "Không tìm thấy bài tập." }, { status: 404 });
  if (!assignment.dueAt) return NextResponse.json({ error: "Bài tập chưa có hạn nộp chung." }, { status: 400 });
  const dueAt = new Date(parsed.data.dueAt);
  if (dueAt <= assignment.dueAt) return NextResponse.json({ error: "Hạn riêng phải muộn hơn hạn chung." }, { status: 400 });
  const member = await db.query.classMembers.findFirst({ where: and(eq(classMembers.classId, assignment.classId), eq(classMembers.userId, parsed.data.userId)) });
  if (!member) return NextResponse.json({ error: "Học sinh không thuộc lớp của bài tập." }, { status: 400 });
  const [extension] = await db.insert(assignmentExtensions).values({ assignmentId, userId: parsed.data.userId, dueAt, createdBy: session.userId })
    .onConflictDoUpdate({ target: [assignmentExtensions.assignmentId, assignmentExtensions.userId], set: { dueAt, updatedAt: new Date(), createdBy: session.userId } }).returning();
  return NextResponse.json({ extension });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const assignmentId = Number(params.id);
  const userId = Number(req.nextUrl.searchParams.get("userId"));
  if (!Number.isInteger(assignmentId) || !Number.isInteger(userId)) return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  const setting = await db.query.assignmentExtensions.findFirst({ where: and(eq(assignmentExtensions.assignmentId, assignmentId), eq(assignmentExtensions.userId, userId)) });
  if (setting?.excused) await db.update(assignmentExtensions).set({ dueAt: null, updatedAt: new Date() }).where(eq(assignmentExtensions.id, setting.id));
  else await db.delete(assignmentExtensions).where(and(eq(assignmentExtensions.assignmentId, assignmentId), eq(assignmentExtensions.userId, userId)));
  return NextResponse.json({ ok: true });
}
