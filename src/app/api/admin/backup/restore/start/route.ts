import { getSession } from "@/lib/auth";
import { CHUNK_SIZE, createSession, maxRestoreBytes, pruneSessions } from "@/lib/restoreSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Bạn không có quyền khôi phục dữ liệu." }, { status: 403 });
  }
  const body = await request.json().catch(() => null) as { originalName?: unknown; totalBytes?: unknown } | null;
  const totalBytes = Number(body?.totalBytes);
  const originalName = typeof body?.originalName === "string" ? body.originalName : "restore.json";
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) {
    return Response.json({ error: "Kích thước file không hợp lệ." }, { status: 400 });
  }
  if (totalBytes > maxRestoreBytes()) {
    return Response.json({ error: `File vượt quá giới hạn ${(maxRestoreBytes() / 1024 / 1024).toFixed(0)} MB. Hãy chia nhỏ hoặc xóa bớt dữ liệu cũ.` }, { status: 413 });
  }
  const expectedChunks = Math.ceil(totalBytes / CHUNK_SIZE);
  // Best-effort cleanup of expired sessions.
  await pruneSessions().catch(() => undefined);
  const { id } = await createSession(expectedChunks, originalName);
  return Response.json({ ok: true, sessionId: id, chunkSize: CHUNK_SIZE, expectedChunks, totalBytes });
}
