import { getSession } from "@/lib/auth";
import { runRestore } from "@/lib/restoreCore";
import { assembleSession, deleteSession, readSession, maxDecompressedChars } from "@/lib/restoreSession";
import { gunzipSync } from "node:zlib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Bạn không có quyền khôi phục dữ liệu." }, { status: 403 });
  }

  let body: { sessionId?: unknown; action?: unknown; confirmation?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return Response.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
  }
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const action = typeof body.action === "string" ? body.action : "";
  const confirmation = typeof body.confirmation === "string" ? body.confirmation : "";
  if (!sessionId) return Response.json({ error: "Thiếu sessionId." }, { status: 400 });

  const meta = await readSession(sessionId);
  if (!meta) return Response.json({ error: "Phiên khôi phục không tồn tại hoặc đã hết hạn." }, { status: 400 });
  if (meta.receivedChunks !== meta.expectedChunks) {
    return Response.json({ error: `Chưa nhận đủ phân đoạn (${meta.receivedChunks}/${meta.expectedChunks}).` }, { status: 400 });
  }

  try {
    const combined = await assembleSession(sessionId);
    // Optionally gunzip first.
    let raw = combined;
    const head = combined.subarray(0, 2);
    const isGzip = head.length === 2 && head[0] === 0x1f && head[1] === 0x8b;
    if (isGzip) {
      const decompressed = gunzipSync(combined);
      if (decompressed.byteLength > maxDecompressedChars()) {
        return Response.json({ error: "File giải nén vượt quá giới hạn cho phép." }, { status: 413 });
      }
      raw = decompressed;
    }

    const text = raw.toString("utf8");
    let parsed: unknown;
    try { parsed = JSON.parse(text); }
    catch { return Response.json({ error: "File không phải là JSON hợp lệ." }, { status: 400 }); }

    const result = await runRestore(parsed, action, confirmation);

    // Always clean up the session after commit (success or failure).
    await deleteSession(sessionId);

    if (result.kind === "error") return Response.json({ error: result.error }, { status: 400 });
    if (result.kind === "preview") {
      return Response.json({
        createdAt: result.createdAt, version: result.version,
        integrity: result.integrity, counts: result.preview,
        unknownUsers: result.unknownUsers, strategy: "merge-only",
      });
    }
    return Response.json({ ok: true, report: result.report });
  } catch (error) {
    await deleteSession(sessionId).catch(() => undefined);
    console.error("Chunked restore failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Không thể khôi phục dữ liệu." }, { status: 400 });
  }
}
