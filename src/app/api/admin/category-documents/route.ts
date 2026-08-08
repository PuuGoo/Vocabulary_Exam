import { NextRequest, NextResponse } from "next/server";
import { asc, eq, inArray, like, or } from "drizzle-orm";
import { db } from "@/db";
import { categoryDocuments, vocabCategories } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { normalizeText } from "@/lib/text";

export const runtime = "nodejs";
const MAX_PDF_BYTES = 4 * 1024 * 1024;
const MAX_BATCH_BYTES = 16 * 1024 * 1024;

async function requireAdmin() {
  const session = await getSession();
  return session?.role === "admin" ? session : null;
}

function removeDocumentPrefix(value: string) {
  return value.replace(/^\s*\d+\s*[._-]?\s*/, "").trim();
}

function numberedDocumentName(order: number, value: string, pdfExtension = false) {
  const withoutExtension = pdfExtension ? value.replace(/\.pdf$/i, "") : value;
  const label = removeDocumentPrefix(withoutExtension) || "Tài liệu";
  const prefix = `${String(order).padStart(2, "0")}_`;
  const extension = pdfExtension ? ".pdf" : "";
  return `${prefix}${label.slice(0, Math.max(1, 256 - prefix.length - extension.length))}${extension}`;
}

async function renumberCategoryDocuments(tx: typeof db, category: string) {
  const rows = await tx.select({ id: categoryDocuments.id, title: categoryDocuments.title, fileName: categoryDocuments.fileName })
    .from(categoryDocuments)
    .where(eq(categoryDocuments.category, category))
    .orderBy(asc(categoryDocuments.createdAt), asc(categoryDocuments.id));
  for (let index = 0; index < rows.length; index += 1) {
    await tx.update(categoryDocuments).set({
      title: numberedDocumentName(index + 1, rows[index].title),
      fileName: numberedDocumentName(index + 1, rows[index].fileName, true),
    }).where(eq(categoryDocuments.id, rows[index].id));
  }
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const category = request.nextUrl.searchParams.get("category")?.trim();
  if (!category) return NextResponse.json({ documents: [] });
  const documentCategories = await db.selectDistinct({ category: categoryDocuments.category }).from(categoryDocuments).where(or(
    eq(categoryDocuments.category, category),
    like(categoryDocuments.category, `${category} / %`),
  ));
  for (const item of documentCategories) await renumberCategoryDocuments(db, item.category);
  // A parent folder acts as a document library for its entire subtree.
  // Keep the stored category on each row so the UI can show where a file came from.
  const documents = await db.select({
    id: categoryDocuments.id,
    category: categoryDocuments.category,
    title: categoryDocuments.title,
    fileName: categoryDocuments.fileName,
    fileSize: categoryDocuments.fileSize,
    createdAt: categoryDocuments.createdAt,
  }).from(categoryDocuments).where(or(
    eq(categoryDocuments.category, category),
    like(categoryDocuments.category, `${category} / %`),
  )).orderBy(asc(categoryDocuments.createdAt));
  return NextResponse.json({ documents });
}

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
  if (files.length === 0) return NextResponse.json({ error: "Hãy chọn ít nhất một file PDF." }, { status: 400 });
  if (files.reduce((total, file) => total + file.size, 0) > MAX_BATCH_BYTES) return NextResponse.json({ error: "Tổng dung lượng mỗi lần import không được vượt quá 16 MB." }, { status: 413 });
  if (files.some((file) => file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"))) return NextResponse.json({ error: "Chỉ chấp nhận file PDF." }, { status: 415 });
  if (files.some((file) => file.size < 1 || file.size > MAX_PDF_BYTES)) return NextResponse.json({ error: "Mỗi file PDF phải nhỏ hơn hoặc bằng 4 MB." }, { status: 413 });
  const [folder] = await db.select({ id: vocabCategories.id }).from(vocabCategories).where(eq(vocabCategories.name, category)).limit(1);
  if (!folder) return NextResponse.json({ error: "Không tìm thấy thư mục đích." }, { status: 404 });
  const documentIds: number[] = [];
  for (const file of files) {
    const fileData = Buffer.from(await file.arrayBuffer());
    if (fileData.subarray(0, 5).toString("ascii") !== "%PDF-") return NextResponse.json({ error: `Nội dung “${file.name}” không phải PDF hợp lệ.` }, { status: 415 });
    const title = files.length === 1 && requestedTitle ? requestedTitle : file.name.replace(/\.pdf$/i, "");
    const [document] = await db.insert(categoryDocuments).values({
      category,
      title: title.slice(0, 256),
      fileName: normalizeText(file.name).slice(0, 256),
      fileType: "application/pdf",
      fileSize: fileData.byteLength,
      fileData,
      createdBy: session.userId,
    }).returning({ id: categoryDocuments.id, title: categoryDocuments.title, fileName: categoryDocuments.fileName, fileSize: categoryDocuments.fileSize, createdAt: categoryDocuments.createdAt });
    documentIds.push(document.id);
  }
  await renumberCategoryDocuments(db, category);
  const documents = await db.select({ id: categoryDocuments.id, category: categoryDocuments.category, title: categoryDocuments.title, fileName: categoryDocuments.fileName, fileSize: categoryDocuments.fileSize, createdAt: categoryDocuments.createdAt })
    .from(categoryDocuments).where(inArray(categoryDocuments.id, documentIds)).orderBy(asc(categoryDocuments.createdAt), asc(categoryDocuments.id));
  return NextResponse.json({ documents, document: documents[0] }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const id = Number(body?.id);
  const title = normalizeText(String(body?.title || "").trim());
  let fileName = normalizeText(String(body?.fileName || "").trim()).replace(/[\\/]/g, "");
  if (!Number.isInteger(id) || id < 1 || !title || !fileName) return NextResponse.json({ error: "Tên tài liệu và tên file không được để trống." }, { status: 400 });
  if (!fileName.toLowerCase().endsWith(".pdf")) fileName += ".pdf";
  if (title.length > 256 || fileName.length > 256) return NextResponse.json({ error: "Tên tài liệu hoặc tên file quá dài." }, { status: 400 });
  const [updated] = await db.update(categoryDocuments).set({ title, fileName }).where(eq(categoryDocuments.id, id)).returning({ category: categoryDocuments.category });
  if (!updated) return NextResponse.json({ error: "Không tìm thấy tài liệu PDF." }, { status: 404 });
  await renumberCategoryDocuments(db, updated.category);
  const [document] = await db.select({
    id: categoryDocuments.id,
    category: categoryDocuments.category,
    title: categoryDocuments.title,
    fileName: categoryDocuments.fileName,
    fileSize: categoryDocuments.fileSize,
    createdAt: categoryDocuments.createdAt,
  }).from(categoryDocuments).where(eq(categoryDocuments.id, id)).limit(1);
  return NextResponse.json({ document });
}

export async function PUT(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const form = await request.formData();
  const id = Number(form.get("id"));
  const file = form.get("file");
  if (!Number.isInteger(id) || id < 1 || !(file instanceof File)) return NextResponse.json({ error: "Tài liệu thay thế không hợp lệ." }, { status: 400 });
  if ((file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) || file.size < 1) return NextResponse.json({ error: "Chỉ chấp nhận file PDF hợp lệ." }, { status: 415 });
  if (file.size > MAX_PDF_BYTES) return NextResponse.json({ error: "File PDF thay thế không được vượt quá 4 MB." }, { status: 413 });
  const fileData = Buffer.from(await file.arrayBuffer());
  if (fileData.subarray(0, 5).toString("ascii") !== "%PDF-") return NextResponse.json({ error: "Nội dung file thay thế không phải PDF hợp lệ." }, { status: 415 });
  const [document] = await db.update(categoryDocuments).set({ fileData, fileSize: fileData.byteLength, fileType: "application/pdf" }).where(eq(categoryDocuments.id, id)).returning({
    id: categoryDocuments.id, category: categoryDocuments.category, title: categoryDocuments.title, fileName: categoryDocuments.fileName, fileSize: categoryDocuments.fileSize, createdAt: categoryDocuments.createdAt,
  });
  if (!document) return NextResponse.json({ error: "Không tìm thấy tài liệu PDF." }, { status: 404 });
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
