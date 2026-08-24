import { NextRequest, NextResponse } from "next/server";
import { asc, eq, inArray, like, or } from "drizzle-orm";
import { db } from "@/db";
import { categoryDocuments, vocabCategories } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { normalizeText } from "@/lib/text";
import { DOCUMENT_CHUNK_BYTES, documentContentLooksValid, documentExtension, documentMimeType, isSupportedDocument, stripDocumentExtension } from "@/lib/categoryDocumentFile";

export const runtime = "nodejs";

async function requireAdmin() {
  const session = await getSession();
  return session?.role === "admin" ? session : null;
}

function removeDocumentPrefix(value: string) {
  return value.replace(/^\s*\d+\s*[._-]?\s*/, "").trim();
}

function numberedDocumentName(order: number, value: string, preserveExtension = false) {
  const extension = preserveExtension ? documentExtension(value) : "";
  const source = extension ? value.slice(0, -extension.length) : value;
  const label = removeDocumentPrefix(source) || "Tài liệu";
  const prefix = `${String(order).padStart(2, "0")}_`;
  return `${prefix}${label.slice(0, Math.max(1, 256 - prefix.length - extension.length))}${extension}`;
}

async function renumberCategoryDocuments(tx: typeof db, category: string) {
  const rows = await tx.select({ id: categoryDocuments.id, title: categoryDocuments.title, fileName: categoryDocuments.fileName })
    .from(categoryDocuments).where(eq(categoryDocuments.category, category)).orderBy(asc(categoryDocuments.createdAt), asc(categoryDocuments.id));
  for (let index = 0; index < rows.length; index += 1) {
    await tx.update(categoryDocuments).set({
      title: numberedDocumentName(index + 1, rows[index].title),
      fileName: numberedDocumentName(index + 1, rows[index].fileName, true),
    }).where(eq(categoryDocuments.id, rows[index].id));
  }
}

const summaryFields = {
  id: categoryDocuments.id, category: categoryDocuments.category, title: categoryDocuments.title,
  fileName: categoryDocuments.fileName, fileType: categoryDocuments.fileType,
  fileSize: categoryDocuments.fileSize, createdAt: categoryDocuments.createdAt,
};

export async function GET(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const category = request.nextUrl.searchParams.get("category")?.trim();
  if (!category) return NextResponse.json({ documents: [] });
  const documentCategories = await db.selectDistinct({ category: categoryDocuments.category }).from(categoryDocuments).where(or(
    eq(categoryDocuments.category, category), like(categoryDocuments.category, `${category} / %`),
  ));
  for (const item of documentCategories) await renumberCategoryDocuments(db, item.category);
  const documents = await db.select(summaryFields).from(categoryDocuments).where(or(
    eq(categoryDocuments.category, category), like(categoryDocuments.category, `${category} / %`),
  )).orderBy(asc(categoryDocuments.createdAt));
  return NextResponse.json({ documents });
}

// Compatibility endpoint for old clients. The new UI uses chunked uploads so
// large files never need to fit in one Vercel request.
export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const form = await request.formData();
  const category = normalizeText(String(form.get("category") || "").trim());
  const files = form.getAll("files").filter((item): item is File => item instanceof File);
  const legacyFile = form.get("file");
  if (files.length === 0 && legacyFile instanceof File) files.push(legacyFile);
  const requestedTitle = normalizeText(String(form.get("title") || "").trim());
  if (!category || category.length > 128) return NextResponse.json({ error: "Thư mục không hợp lệ." }, { status: 400 });
  if (files.length === 0) return NextResponse.json({ error: "Hãy chọn ít nhất một tài liệu PDF hoặc Word." }, { status: 400 });
  if (files.some((file) => !isSupportedDocument(file.name, file.type))) return NextResponse.json({ error: "Chỉ chấp nhận PDF, DOCX hoặc DOC." }, { status: 415 });
  if (files.some((file) => file.size < 1 || file.size > DOCUMENT_CHUNK_BYTES)) return NextResponse.json({ error: "File lớn cần được tải lên bằng chế độ phân mảnh trên giao diện mới." }, { status: 413 });
  const [folder] = await db.select({ id: vocabCategories.id }).from(vocabCategories).where(eq(vocabCategories.name, category)).limit(1);
  if (!folder) return NextResponse.json({ error: "Không tìm thấy thư mục đích." }, { status: 404 });
  const documentIds: number[] = [];
  for (const file of files) {
    const fileData = Buffer.from(await file.arrayBuffer());
    if (!documentContentLooksValid(file.name, fileData)) return NextResponse.json({ error: `Nội dung “${file.name}” không đúng định dạng file.` }, { status: 415 });
    const title = files.length === 1 && requestedTitle ? requestedTitle : stripDocumentExtension(file.name);
    const [document] = await db.insert(categoryDocuments).values({
      category, title: title.slice(0, 256), fileName: normalizeText(file.name).slice(0, 256),
      fileType: documentMimeType(file.name, file.type), fileSize: fileData.byteLength, fileData, createdBy: session.userId,
    }).returning({ id: categoryDocuments.id });
    documentIds.push(document.id);
  }
  await renumberCategoryDocuments(db, category);
  const documents = await db.select(summaryFields).from(categoryDocuments).where(inArray(categoryDocuments.id, documentIds)).orderBy(asc(categoryDocuments.createdAt), asc(categoryDocuments.id));
  return NextResponse.json({ documents, document: documents[0] }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const id = Number(body?.id);
  const title = normalizeText(String(body?.title || "").trim());
  let fileName = normalizeText(String(body?.fileName || "").trim()).replace(/[\\/]/g, "");
  if (!Number.isInteger(id) || id < 1 || !title || !fileName) return NextResponse.json({ error: "Tên tài liệu và tên file không được để trống." }, { status: 400 });
  const [current] = await db.select({ fileName: categoryDocuments.fileName }).from(categoryDocuments).where(eq(categoryDocuments.id, id)).limit(1);
  if (!current) return NextResponse.json({ error: "Không tìm thấy tài liệu." }, { status: 404 });
  const currentExtension = documentExtension(current.fileName);
  if (!documentExtension(fileName)) fileName += currentExtension;
  if (documentExtension(fileName) !== currentExtension) return NextResponse.json({ error: `Không thể đổi định dạng file. Hãy giữ đuôi ${currentExtension}.` }, { status: 400 });
  if (title.length > 256 || fileName.length > 256) return NextResponse.json({ error: "Tên tài liệu hoặc tên file quá dài." }, { status: 400 });
  const [updated] = await db.update(categoryDocuments).set({ title, fileName }).where(eq(categoryDocuments.id, id)).returning({ category: categoryDocuments.category });
  await renumberCategoryDocuments(db, updated.category);
  const [document] = await db.select(summaryFields).from(categoryDocuments).where(eq(categoryDocuments.id, id)).limit(1);
  return NextResponse.json({ document });
}

export async function PUT(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const form = await request.formData();
  const id = Number(form.get("id"));
  const file = form.get("file");
  if (!Number.isInteger(id) || id < 1 || !(file instanceof File)) return NextResponse.json({ error: "Tài liệu thay thế không hợp lệ." }, { status: 400 });
  if (!isSupportedDocument(file.name, file.type) || file.size < 1 || file.size > DOCUMENT_CHUNK_BYTES) return NextResponse.json({ error: "Hãy dùng giao diện mới để thay file PDF/Word lớn." }, { status: 415 });
  const fileData = Buffer.from(await file.arrayBuffer());
  if (!documentContentLooksValid(file.name, fileData)) return NextResponse.json({ error: "Nội dung file thay thế không đúng định dạng." }, { status: 415 });
  const [current] = await db.select({ fileName: categoryDocuments.fileName }).from(categoryDocuments).where(eq(categoryDocuments.id, id)).limit(1);
  if (!current) return NextResponse.json({ error: "Không tìm thấy tài liệu." }, { status: 404 });
  const currentStem = stripDocumentExtension(current.fileName);
  const fileName = `${currentStem}${documentExtension(file.name)}`.slice(0, 256);
  const [document] = await db.update(categoryDocuments).set({ fileName, fileData, fileSize: fileData.byteLength, fileType: documentMimeType(file.name, file.type) }).where(eq(categoryDocuments.id, id)).returning(summaryFields);
  if (!document) return NextResponse.json({ error: "Không tìm thấy tài liệu." }, { status: 404 });
  return NextResponse.json({ document });
}

export async function DELETE(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Tài liệu không hợp lệ." }, { status: 400 });
  const deleted = await db.delete(categoryDocuments).where(eq(categoryDocuments.id, id)).returning({ id: categoryDocuments.id, category: categoryDocuments.category });
  if (!deleted.length) return NextResponse.json({ error: "Không tìm thấy tài liệu." }, { status: 404 });
  await renumberCategoryDocuments(db, deleted[0].category);
  return NextResponse.json({ ok: true });
}
