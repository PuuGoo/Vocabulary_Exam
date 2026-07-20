import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { assignmentSubmissions } from "@/db/schema";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const assignmentId = Number(params.id);
  if (!Number.isInteger(assignmentId)) return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  const requestedUserId = Number(req.nextUrl.searchParams.get("userId"));
  if (session.role === "admin" && !Number.isInteger(requestedUserId)) return NextResponse.json({ error: "Thiếu học sinh cần xem." }, { status: 400 });
  const row = session.role === "admin"
    ? await db.query.assignmentSubmissions.findFirst({ where: and(eq(assignmentSubmissions.assignmentId, assignmentId), eq(assignmentSubmissions.userId, requestedUserId)) })
    : await db.query.assignmentSubmissions.findFirst({ where: and(eq(assignmentSubmissions.assignmentId, assignmentId), eq(assignmentSubmissions.userId, session.userId)) });
  if (!row?.fileData || !row.fileName) return NextResponse.json({ error: "Không tìm thấy tệp." }, { status: 404 });
  return new Response(new Uint8Array(row.fileData), {
    headers: {
      "Content-Type": row.fileType || "application/octet-stream",
      "Content-Length": String(row.fileSize || row.fileData.length),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
