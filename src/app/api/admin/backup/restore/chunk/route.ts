import { getSession } from "@/lib/auth";
import { CHUNK_SIZE, appendChunk } from "@/lib/restoreSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Bạn không có quyền khôi phục dữ liệu." }, { status: 403 });
  }
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session") || "";
  const index = Number(url.searchParams.get("index"));
  if (!sessionId) return Response.json({ error: "Thiếu sessionId." }, { status: 400 });
  if (!Number.isInteger(index) || index < 0) return Response.json({ error: "Chỉ số phân đoạn không hợp lệ." }, { status: 400 });

  const arrayBuffer = await request.arrayBuffer();
  const buf = Buffer.from(arrayBuffer);
  if (buf.byteLength === 0) return Response.json({ error: "Phân đoạn rỗng." }, { status: 400 });
  if (buf.byteLength > CHUNK_SIZE * 2) return Response.json({ error: `Phân đoạn quá lớn (${buf.byteLength} > ${CHUNK_SIZE * 2}).` }, { status: 413 });

  try {
    const meta = await appendChunk(sessionId, index, buf);
    return Response.json({ ok: true, receivedChunks: meta.receivedChunks, expectedChunks: meta.expectedChunks });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Không thể nhận phân đoạn." }, { status: 400 });
  }
}
