import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { assignmentExtensions, assignmentSubmissions, assignments, attempts, classes, classMembers, users, vocabSets } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { assignmentProgress } from "@/lib/assignments";
import { normalizeText } from "@/lib/text";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Mã bài tập không hợp lệ." }, { status: 400 });
  const [assignment] = await db
    .select({
      id: assignments.id,
      classId: assignments.classId,
      className: classes.name,
      setId: assignments.setId,
      setName: vocabSets.name,
      setType: vocabSets.type,
      title: assignments.title,
      instructions: assignments.instructions,
      mode: assignments.mode,
      minScore: assignments.minScore,
      dueAt: assignments.dueAt,
      timeLimitMinutes: assignments.timeLimitMinutes,
      archived: assignments.archived,
      createdAt: assignments.createdAt,
      updatedAt: assignments.updatedAt,
    })
    .from(assignments)
    .innerJoin(classes, eq(classes.id, assignments.classId))
    .innerJoin(vocabSets, eq(vocabSets.id, assignments.setId))
    .where(eq(assignments.id, id));
  if (!assignment) return NextResponse.json({ error: "Không tìm thấy bài tập." }, { status: 404 });

  const members = await db
    .select({ userId: users.id, username: users.username, displayName: users.displayName })
    .from(classMembers)
    .innerJoin(users, eq(users.id, classMembers.userId))
    .where(eq(classMembers.classId, assignment.classId));
  const userIds = members.map((member) => member.userId);
  const attemptRows = userIds.length
    ? await db.select().from(attempts).where(and(inArray(attempts.userId, userIds), eq(attempts.setId, assignment.setId)))
    : [];
  const extensionRows = userIds.length ? await db.select().from(assignmentExtensions).where(and(eq(assignmentExtensions.assignmentId, id), inArray(assignmentExtensions.userId, userIds))) : [];
  const submissionRows = userIds.length ? await db.select({ id: assignmentSubmissions.id, userId: assignmentSubmissions.userId, textContent: assignmentSubmissions.textContent, fileName: assignmentSubmissions.fileName, fileType: assignmentSubmissions.fileType, fileSize: assignmentSubmissions.fileSize, submittedAt: assignmentSubmissions.submittedAt }).from(assignmentSubmissions).where(and(eq(assignmentSubmissions.assignmentId, id), inArray(assignmentSubmissions.userId, userIds))) : [];
  const students = members.map((member) => {
    const setting = extensionRows.find((item) => item.userId === member.userId);
    const extensionDueAt = setting?.dueAt || null;
    const progress = assignmentProgress({ ...assignment, dueAt: extensionDueAt || assignment.dueAt }, attemptRows.filter((attempt) => attempt.userId === member.userId));
    return {
      ...member,
      extensionDueAt,
      excused: setting?.excused || false,
      submission: submissionRows.find((item) => item.userId === member.userId) || null,
      ...progress,
      ...(setting?.excused ? { status: "excused" as const } : {}),
    };
  });
  return NextResponse.json({ assignment, students });
}

const patchSchema = z.object({
  title: z.string().trim().min(1).max(256).optional(),
  instructions: z.string().trim().max(4000).optional(),
  minScore: z.number().int().min(0).max(100).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  timeLimitMinutes: z.number().int().min(1).max(120).nullable().optional(),
  archived: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Mã bài tập không hợp lệ." }, { status: 400 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  const existing = await db.query.assignments.findFirst({ where: eq(assignments.id, id) });
  if (!existing) return NextResponse.json({ error: "Không tìm thấy bài tập." }, { status: 404 });
  if (existing.mode === "timed" && parsed.data.timeLimitMinutes === null) {
    return NextResponse.json({ error: "Bài thi tính giờ phải có thời lượng." }, { status: 400 });
  }
  const patch: Partial<typeof assignments.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) patch.title = normalizeText(parsed.data.title);
  if (parsed.data.instructions !== undefined) patch.instructions = normalizeText(parsed.data.instructions);
  if (parsed.data.minScore !== undefined) patch.minScore = parsed.data.minScore;
  if (parsed.data.dueAt !== undefined) patch.dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;
  if (parsed.data.archived !== undefined) patch.archived = parsed.data.archived;
  if (existing.mode === "timed" && parsed.data.timeLimitMinutes !== undefined) patch.timeLimitMinutes = parsed.data.timeLimitMinutes;
  const [updated] = await db.update(assignments).set(patch).where(eq(assignments.id, id)).returning();
  return NextResponse.json({ assignment: updated });
}
