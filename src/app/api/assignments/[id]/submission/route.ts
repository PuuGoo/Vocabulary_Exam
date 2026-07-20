import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { assignmentSubmissions, assignments, classMembers, classes, vocabSets } from "@/db/schema";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

async function context(id: number, userId: number) {
  const [assignment] = await db.select({ id: assignments.id, title: assignments.title, instructions: assignments.instructions, classId: assignments.classId, className: classes.name, setName: vocabSets.name, dueAt: assignments.dueAt, archived: assignments.archived })
    .from(assignments).innerJoin(classes, eq(classes.id, assignments.classId)).innerJoin(vocabSets, eq(vocabSets.id, assignments.setId)).where(eq(assignments.id, id));
  if (!assignment) return null;
  const member = await db.query.classMembers.findFirst({ where: and(eq(classMembers.classId, assignment.classId), eq(classMembers.userId, userId)) });
  return member ? assignment : null;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Mã bài tập không hợp lệ." }, { status: 400 });
  const assignment = await context(id, session.userId);
  if (!assignment) return NextResponse.json({ error: "Bạn không có quyền nộp bài này." }, { status: 403 });
  const row = await db.query.assignmentSubmissions.findFirst({ where: and(eq(assignmentSubmissions.assignmentId, id), eq(assignmentSubmissions.userId, session.userId)) });
  const submission = row ? { id: row.id, textContent: row.textContent, fileName: row.fileName, fileType: row.fileType, fileSize: row.fileSize, submittedAt: row.submittedAt, updatedAt: row.updatedAt } : null;
  return NextResponse.json({ assignment, submission });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Mã bài tập không hợp lệ." }, { status: 400 });
  const assignment = await context(id, session.userId);
  if (!assignment || assignment.archived) return NextResponse.json({ error: "Bài tập không còn nhận bài nộp." }, { status: 403 });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  const textContent = String(form.get("textContent") || "").trim();
  if (textContent.length > 10000) return NextResponse.json({ error: "Nội dung văn bản tối đa 10.000 ký tự." }, { status: 400 });
  const existing = await db.query.assignmentSubmissions.findFirst({ where: and(eq(assignmentSubmissions.assignmentId, id), eq(assignmentSubmissions.userId, session.userId)) });
  const incoming = form.get("file");
  const file = incoming && typeof incoming !== "string" && incoming.size > 0 ? incoming : null;
  if (file && (file.size > MAX_FILE_SIZE || !ALLOWED_TYPES.has(file.type))) return NextResponse.json({ error: "Chỉ nhận ảnh JPG/PNG/WebP, PDF, TXT hoặc Word tối đa 5 MB." }, { status: 400 });
  const removeFile = form.get("removeFile") === "1";
  const fileData = file ? Buffer.from(await file.arrayBuffer()) : removeFile ? null : existing?.fileData || null;
  const fileName = file ? file.name.replace(/[\\/\x00-\x1f]/g, "_").slice(0, 256) : removeFile ? null : existing?.fileName || null;
  const fileType = file ? file.type : removeFile ? null : existing?.fileType || null;
  const fileSize = file ? file.size : removeFile ? null : existing?.fileSize || null;
  if (!textContent && !fileData) return NextResponse.json({ error: "Hãy nhập nội dung hoặc chọn một tệp." }, { status: 400 });
  const now = new Date();
  const [row] = await db.insert(assignmentSubmissions).values({ assignmentId: id, userId: session.userId, textContent: textContent || null, fileName, fileType, fileSize, fileData, submittedAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: [assignmentSubmissions.assignmentId, assignmentSubmissions.userId], set: { textContent: textContent || null, fileName, fileType, fileSize, fileData, submittedAt: now, updatedAt: now } }).returning();
  return NextResponse.json({ submission: { id: row.id, fileName: row.fileName, fileType: row.fileType, fileSize: row.fileSize, submittedAt: row.submittedAt } });
}
