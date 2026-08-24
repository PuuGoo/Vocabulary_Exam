import { randomUUID } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { categoryDocuments, categoryDocumentUploads, vocabCategories } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { normalizeText } from "@/lib/text";
import { DOCUMENT_CHUNK_BYTES, documentMimeType, isSupportedDocument, stripDocumentExtension } from "@/lib/categoryDocumentFile";

export const runtime = "nodejs";

const schema = z.object({
  category: z.string().trim().min(1).max(128),
  title: z.string().trim().max(256).optional().default(""),
  fileName: z.string().trim().min(1).max(256),
  fileType: z.string().max(128).optional().default(""),
  fileSize: z.number().int().positive().max(1_000_000_000, "File vượt giới hạn kỹ thuật 1 GB của PostgreSQL."),
  targetDocumentId: z.number().int().positive().nullable().optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message || "Thông tin file không hợp lệ." }, { status: 400 });
  const input = parsed.data;
  if (!isSupportedDocument(input.fileName, input.fileType)) return Response.json({ error: "Chỉ chấp nhận file PDF, DOCX hoặc DOC." }, { status: 415 });

  const category = normalizeText(input.category);
  const [folder] = await db.select({ id: vocabCategories.id }).from(vocabCategories).where(eq(vocabCategories.name, category)).limit(1);
  if (!folder) return Response.json({ error: "Không tìm thấy thư mục đích." }, { status: 404 });
  if (input.targetDocumentId) {
    const [target] = await db.select({ id: categoryDocuments.id }).from(categoryDocuments).where(eq(categoryDocuments.id, input.targetDocumentId)).limit(1);
    if (!target) return Response.json({ error: "Không tìm thấy tài liệu cần thay thế." }, { status: 404 });
  }

  await db.delete(categoryDocumentUploads).where(lt(categoryDocumentUploads.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)));
  const uploadId = randomUUID();
  const chunkCount = Math.ceil(input.fileSize / DOCUMENT_CHUNK_BYTES);
  await db.insert(categoryDocumentUploads).values({
    id: uploadId,
    category,
    title: normalizeText(input.title || stripDocumentExtension(input.fileName)).slice(0, 256),
    fileName: normalizeText(input.fileName).replace(/[\\/]/g, "").slice(0, 256),
    fileType: documentMimeType(input.fileName, input.fileType),
    fileSize: input.fileSize,
    chunkCount,
    targetDocumentId: input.targetDocumentId ?? null,
    createdBy: session.userId,
  });
  return Response.json({ uploadId, chunkBytes: DOCUMENT_CHUNK_BYTES, chunkCount });
}
