import { NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { assignmentExtensions, assignmentSubmissions, assignments, attempts, classes, classMembers, vocabSets } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { assignmentHref, assignmentProgress } from "@/lib/assignments";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const memberships = await db.select({ classId: classMembers.classId }).from(classMembers).where(eq(classMembers.userId, session.userId));
  const classIds = memberships.map((item) => item.classId);
  if (classIds.length === 0) return NextResponse.json({ assignments: [] });
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
      createdAt: assignments.createdAt,
    })
    .from(assignments)
    .innerJoin(classes, eq(classes.id, assignments.classId))
    .innerJoin(vocabSets, eq(vocabSets.id, assignments.setId))
    .where(and(inArray(assignments.classId, classIds), eq(assignments.archived, false)))
    .orderBy(asc(assignments.dueAt), assignments.createdAt);
  const setIds = [...new Set(rows.map((row) => row.setId))];
  const attemptRows = setIds.length
    ? await db.select().from(attempts).where(and(eq(attempts.userId, session.userId), inArray(attempts.setId, setIds)))
    : [];
  const extensionRows = rows.length ? await db.select().from(assignmentExtensions).where(and(eq(assignmentExtensions.userId, session.userId), inArray(assignmentExtensions.assignmentId, rows.map((row) => row.id)))) : [];
  const submissionRows = rows.length ? await db.select({ assignmentId: assignmentSubmissions.assignmentId, submittedAt: assignmentSubmissions.submittedAt, fileName: assignmentSubmissions.fileName }).from(assignmentSubmissions).where(and(eq(assignmentSubmissions.userId, session.userId), inArray(assignmentSubmissions.assignmentId, rows.map((row) => row.id)))) : [];
  const result = rows.map((row) => {
    const setting = extensionRows.find((item) => item.assignmentId === row.id);
    const extensionDueAt = setting?.dueAt || null;
    const effectiveRow = { ...row, dueAt: extensionDueAt || row.dueAt };
    const progress = assignmentProgress(effectiveRow, attemptRows);
    return {
      ...effectiveRow,
      originalDueAt: row.dueAt,
      extensionDueAt,
      excused: setting?.excused || false,
      submission: submissionRows.find((item) => item.assignmentId === row.id) || null,
      ...progress,
      ...(setting?.excused ? { status: "excused" as const } : {}),
      href: assignmentHref(row),
    };
  }).sort((a, b) => {
    const aDone = a.status === "completed" || a.status === "completed_late";
    const bDone = b.status === "completed" || b.status === "completed_late";
    if (aDone !== bDone) return aDone ? 1 : -1;
    return (a.dueAt?.getTime() || Number.MAX_SAFE_INTEGER) - (b.dueAt?.getTime() || Number.MAX_SAFE_INTEGER);
  });
  return NextResponse.json({ assignments: result });
}
