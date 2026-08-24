import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { categoryDocumentUploadChunks, categoryDocumentUploads } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { DOCUMENT_CHUNK_BYTES } from "@/lib/categoryDocumentFile";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function PUT(request: Request, { params }: { params: { uploadId: string; index: string } }) {
  const session = await getSession();
  if (!session || session.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
  const chunkIndex = Number(params.index);
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) return Response.json({ error: "Thứ tự khối dữ liệu không hợp lệ." }, { status: 400 });
  const [upload] = await db.select().from(categoryDocumentUploads).where(and(
    eq(categoryDocumentUploads.id, params.uploadId), eq(categoryDocumentUploads.createdBy, session.userId),
  )).limit(1);
  if (!upload) return Response.json({ error: "Phiên tải lên đã hết hạn hoặc không tồn tại." }, { status: 404 });
  if (chunkIndex >= upload.chunkCount) return Response.json({ error: "Khối dữ liệu vượt ngoài phạm vi file." }, { status: 400 });
  const data = Buffer.from(await request.arrayBuffer());
  const expectedBytes = chunkIndex === upload.chunkCount - 1 ? upload.fileSize - chunkIndex * DOCUMENT_CHUNK_BYTES : DOCUMENT_CHUNK_BYTES;
  if (data.byteLength !== expectedBytes || data.byteLength > DOCUMENT_CHUNK_BYTES) return Response.json({ error: "Dung lượng khối dữ liệu không khớp." }, { status: 400 });
  await db.insert(categoryDocumentUploadChunks).values({ uploadId: upload.id, chunkIndex, fileData: data }).onConflictDoUpdate({
    target: [categoryDocumentUploadChunks.uploadId, categoryDocumentUploadChunks.chunkIndex],
    set: { fileData: data },
  });
  return Response.json({ ok: true, chunkIndex, receivedBytes: data.byteLength });
}
