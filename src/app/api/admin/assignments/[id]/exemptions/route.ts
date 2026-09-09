import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { assignmentExtensions, assignments, classMembers } from "@/db/schema";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";

const schema = z.object({ userId: z.number().int().positive() });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireAdminPermission("assignments.edit");
  if (isAuthorizationError(access)) return access;
  const assignmentId = Number(params.id);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!Number.isInteger(assignmentId) || !parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  const assignment = await db.query.assignments.findFirst({ where: eq(assignments.id, assignmentId) });
  if (!assignment) return NextResponse.json({ error: "Không tìm thấy bài tập." }, { status: 404 });
  const member = await db.query.classMembers.findFirst({ where: and(eq(classMembers.classId, assignment.classId), eq(classMembers.userId, parsed.data.userId)) });
  if (!member) return NextResponse.json({ error: "Học sinh không thuộc lớp của bài tập." }, { status: 400 });
  const [setting] = await db.insert(assignmentExtensions).values({ assignmentId, userId: parsed.data.userId, excused: true, createdBy: access.userId })
    .onConflictDoUpdate({ target: [assignmentExtensions.assignmentId, assignmentExtensions.userId], set: { excused: true, updatedAt: new Date(), createdBy: access.userId } }).returning();
  return NextResponse.json({ setting });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireAdminPermission("assignments.edit");
  if (isAuthorizationError(access)) return access;
  const assignmentId = Number(params.id);
  const userId = Number(req.nextUrl.searchParams.get("userId"));
  if (!Number.isInteger(assignmentId) || !Number.isInteger(userId)) return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  const setting = await db.query.assignmentExtensions.findFirst({ where: and(eq(assignmentExtensions.assignmentId, assignmentId), eq(assignmentExtensions.userId, userId)) });
  if (setting?.dueAt) await db.update(assignmentExtensions).set({ excused: false, updatedAt: new Date() }).where(eq(assignmentExtensions.id, setting.id));
  else await db.delete(assignmentExtensions).where(and(eq(assignmentExtensions.assignmentId, assignmentId), eq(assignmentExtensions.userId, userId)));
  return NextResponse.json({ ok: true });
}
