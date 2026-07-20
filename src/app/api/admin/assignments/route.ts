import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { assignmentExtensions, assignments, attempts, classes, classMembers, vocabSets } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { assignmentProgress, ASSIGNMENT_MODES, modesForSetType } from "@/lib/assignments";
import { normalizeText } from "@/lib/text";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const includeArchived = req.nextUrl.searchParams.get("archived") === "1";
  const rows = await db
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
    .where(eq(assignments.archived, includeArchived))
    .orderBy(asc(assignments.dueAt), assignments.createdAt);

  const classIds = [...new Set(rows.map((row) => row.classId))];
  const setIds = [...new Set(rows.map((row) => row.setId))];
  const members = classIds.length ? await db.select().from(classMembers).where(inArray(classMembers.classId, classIds)) : [];
  const userIds = [...new Set(members.map((member) => member.userId))];
  const attemptRows = userIds.length && setIds.length
    ? await db.select().from(attempts).where(and(inArray(attempts.userId, userIds), inArray(attempts.setId, setIds)))
    : [];
  const extensionRows = rows.length && userIds.length
    ? await db.select().from(assignmentExtensions).where(and(inArray(assignmentExtensions.assignmentId, rows.map((row) => row.id)), inArray(assignmentExtensions.userId, userIds)))
    : [];

  const result = rows.map((row) => {
    const classUserIds = members.filter((member) => member.classId === row.classId).map((member) => member.userId);
    const progress = classUserIds.map((userId) => {
      const setting = extensionRows.find((item) => item.assignmentId === row.id && item.userId === userId);
      if (setting?.excused) return { ...assignmentProgress(row, []), status: "excused" as const };
      return assignmentProgress({ ...row, dueAt: setting?.dueAt || row.dueAt }, attemptRows.filter((attempt) => attempt.userId === userId));
    });
    return {
      ...row,
      summary: {
        total: classUserIds.length,
        completed: progress.filter((item) => item.status === "completed" || item.status === "completed_late").length,
        late: progress.filter((item) => item.status === "completed_late").length,
        overdue: progress.filter((item) => item.status === "overdue").length,
        inProgress: progress.filter((item) => item.status === "in_progress").length,
        excused: progress.filter((item) => item.status === "excused").length,
      },
    };
  });
  return NextResponse.json({ assignments: result });
}

const createSchema = z.object({
  classId: z.number().int().positive().optional(),
  classIds: z.array(z.number().int().positive()).min(1).max(50).optional(),
  setId: z.number().int().positive(),
  title: z.string().trim().min(1).max(256),
  instructions: z.string().trim().max(4000).default(""),
  mode: z.enum(ASSIGNMENT_MODES),
  minScore: z.number().int().min(0).max(100).default(70),
  dueAt: z.string().datetime().nullable().optional(),
  timeLimitMinutes: z.number().int().min(1).max(120).nullable().optional(),
}).superRefine((data, context) => {
  if (!data.classId && !data.classIds?.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "Vui lòng chọn ít nhất một lớp." });
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ." }, { status: 400 });

  const classIds = [...new Set(parsed.data.classIds?.length ? parsed.data.classIds : [parsed.data.classId!])];
  const [classRows, setRow] = await Promise.all([
    db.select({ id: classes.id }).from(classes).where(inArray(classes.id, classIds)),
    db.query.vocabSets.findFirst({ where: eq(vocabSets.id, parsed.data.setId) }),
  ]);
  if (classRows.length !== classIds.length) return NextResponse.json({ error: "Có lớp học không còn tồn tại." }, { status: 404 });
  if (!setRow) return NextResponse.json({ error: "Không tìm thấy bộ từ." }, { status: 404 });
  if (setRow.classId !== null && (classIds.length !== 1 || setRow.classId !== classIds[0])) {
    return NextResponse.json({ error: "Bộ từ riêng của lớp không thể giao cho lớp khác." }, { status: 400 });
  }
  if (!modesForSetType(setRow.type).includes(parsed.data.mode)) return NextResponse.json({ error: "Chế độ không phù hợp với bộ từ." }, { status: 400 });
  if (parsed.data.mode === "timed" && !parsed.data.timeLimitMinutes) return NextResponse.json({ error: "Vui lòng chọn thời gian thi." }, { status: 400 });

  const title = normalizeText(parsed.data.title);
  const instructions = normalizeText(parsed.data.instructions);
  const rows = await db.insert(assignments).values(classIds.map((classId) => ({
    classId,
    setId: parsed.data.setId,
    title,
    instructions,
    mode: parsed.data.mode,
    minScore: parsed.data.minScore,
    dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
    timeLimitMinutes: parsed.data.mode === "timed" ? parsed.data.timeLimitMinutes : null,
    createdBy: session.userId,
  }))).returning();
  return NextResponse.json({ assignment: rows[0], assignments: rows, createdCount: rows.length });
}
