import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { categoryDocuments, categoryDocumentUploadChunks, categoryDocumentUploads } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { documentContentLooksValid, documentExtension } from "@/lib/categoryDocumentFile";

export const runtime = "nodejs";
export const maxDuration = 60;

function removePrefix(value: string) {
  return value.replace(/^\s*\d+\s*[._-]?\s*/, "").trim();
}

function numbered(order: number, value: string, keepExtension = false) {
  const extension = keepExtension ? documentExtension(value) : "";
  const source = extension ? value.slice(0, -extension.length) : value;
  const prefix = `${String(order).padStart(2, "0")}_`;
  return `${prefix}${(removePrefix(source) || "Tài liệu").slice(0, Math.max(1, 256 - prefix.length - extension.length))}${extension}`;
}

export async function POST(_request: Request, { params }: { params: { uploadId: string } }) {
  const session = await getSession();
  if (!session || session.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
  const [upload] = await db.select().from(categoryDocumentUploads).where(and(
    eq(categoryDocumentUploads.id, params.uploadId), eq(categoryDocumentUploads.createdBy, session.userId),
  )).limit(1);
  if (!upload) return Response.json({ error: "Phiên tải lên đã hết hạn hoặc không tồn tại." }, { status: 404 });
  const chunks = await db.select({
    chunkIndex: categoryDocumentUploadChunks.chunkIndex,
    byteLength: sql<number>`octet_length(${categoryDocumentUploadChunks.fileData})::int`,
  }).from(categoryDocumentUploadChunks).where(eq(categoryDocumentUploadChunks.uploadId, upload.id)).orderBy(asc(categoryDocumentUploadChunks.chunkIndex));
  if (chunks.length !== upload.chunkCount || chunks.some((chunk, index) => chunk.chunkIndex !== index)) return Response.json({ error: `Chưa nhận đủ dữ liệu (${chunks.length}/${upload.chunkCount} phần).` }, { status: 409 });
  if (chunks.reduce((total, chunk) => total + chunk.byteLength, 0) !== upload.fileSize) return Response.json({ error: "Dung lượng file sau khi ghép không khớp file gốc." }, { status: 409 });
  const [signature] = await db.select({
    data: sql<Buffer>`substring(${categoryDocumentUploadChunks.fileData} from 1 for 8)`,
  }).from(categoryDocumentUploadChunks).where(and(
    eq(categoryDocumentUploadChunks.uploadId, upload.id), eq(categoryDocumentUploadChunks.chunkIndex, 0),
  )).limit(1);
  if (!signature || !documentContentLooksValid(upload.fileName, signature.data)) return Response.json({ error: "Nội dung file không đúng định dạng hoặc đã bị hỏng." }, { status: 415 });

  // Assemble inside PostgreSQL. This avoids downloading the whole file from the
  // database and uploading it again through the serverless function.
  const assembledFile = sql<Buffer>`(
    select string_agg(${categoryDocumentUploadChunks.fileData}, ''::bytea order by ${categoryDocumentUploadChunks.chunkIndex})
    from ${categoryDocumentUploadChunks}
    where ${categoryDocumentUploadChunks.uploadId} = ${upload.id}
  )`;

  const document = await db.transaction(async (tx) => {
    let saved;
    if (upload.targetDocumentId) {
      [saved] = await tx.update(categoryDocuments).set({
        fileName: upload.fileName, fileType: upload.fileType, fileSize: upload.fileSize, fileData: assembledFile,
      }).where(eq(categoryDocuments.id, upload.targetDocumentId)).returning({ id: categoryDocuments.id, category: categoryDocuments.category });
      if (!saved) throw new Error("Không tìm thấy tài liệu cần thay thế.");
    } else {
      [saved] = await tx.insert(categoryDocuments).values({
        category: upload.category, title: upload.title, fileName: upload.fileName, fileType: upload.fileType,
        fileSize: upload.fileSize, fileData: assembledFile, createdBy: session.userId,
      }).returning({ id: categoryDocuments.id, category: categoryDocuments.category });
    }
    const rows = await tx.select({ id: categoryDocuments.id, title: categoryDocuments.title, fileName: categoryDocuments.fileName })
      .from(categoryDocuments).where(eq(categoryDocuments.category, saved.category)).orderBy(asc(categoryDocuments.createdAt), asc(categoryDocuments.id));
    for (let index = 0; index < rows.length; index += 1) {
      await tx.update(categoryDocuments).set({ title: numbered(index + 1, rows[index].title), fileName: numbered(index + 1, rows[index].fileName, true) }).where(eq(categoryDocuments.id, rows[index].id));
    }
    await tx.delete(categoryDocumentUploads).where(eq(categoryDocumentUploads.id, upload.id));
    const [finalDocument] = await tx.select({
      id: categoryDocuments.id, category: categoryDocuments.category, title: categoryDocuments.title,
      fileName: categoryDocuments.fileName, fileType: categoryDocuments.fileType,
      fileSize: categoryDocuments.fileSize, createdAt: categoryDocuments.createdAt,
    }).from(categoryDocuments).where(eq(categoryDocuments.id, saved.id)).limit(1);
    return finalDocument;
  });
  return Response.json({ document, ok: true }, { status: upload.targetDocumentId ? 200 : 201 });
}
