import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categoryDocuments, vocabCategories } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { normalizeText } from "@/lib/text";

export const runtime = "nodejs";
const MAX_PDF_BYTES = 4 * 1024 * 1024;

async function requireAdmin() {
  const session = await getSession();
  return session?.role === "admin" ? session : null;
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const category = request.nextUrl.searchParams.get("category")?.trim();
  if (!category) return NextResponse.json({ documents: [] });
  const documents = await db.select({
    id: categoryDocuments.id,
    category: categoryDocuments.category,
    title: categoryDocuments.title,
    fileName: categoryDocuments.fileName,
    fileSize: categoryDocuments.fileSize,
    createdAt: categoryDocuments.createdAt,
  }).from(categoryDocuments).where(eq(categoryDocuments.category, category)).orderBy(asc(categoryDocuments.createdAt));
  return NextResponse.json({ documents });
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const form = await request.formData();
  const category = normalizeText(String(form.get("category") || "").trim());
  const file = form.get("file");
  const requestedTitle = normalizeText(String(form.get("title") || "").trim());
  if (!category || category.length > 128) return NextResponse.json({ error: "Thư mục không hợp lệ." }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "Hãy chọn một file PDF." }, { status: 400 });
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return NextResponse.json({ error: "Chỉ chấp nhận file PDF." }, { status: 415 });
  if (file.size < 1 || file.size > MAX_PDF_BYTES) return NextResponse.json({ error: "File PDF phải nhỏ hơn hoặc bằng 4 MB." }, { status: 413 });
  const [folder] = await db.select({ id: vocabCategories.id }).from(vocabCategories).where(eq(vocabCategories.name, category)).limit(1);
  if (!folder) return NextResponse.json({ error: "Không tìm thấy thư mục đích." }, { status: 404 });
  const fileData = Buffer.from(await file.arrayBuffer());
  if (fileData.subarray(0, 5).toString("ascii") !== "%PDF-") return NextResponse.json({ error: "Nội dung file không phải PDF hợp lệ." }, { status: 415 });
  const title = requestedTitle || file.name.replace(/\.pdf$/i, "");
  const [document] = await db.insert(categoryDocuments).values({
    category,
    title: title.slice(0, 256),
    fileName: normalizeText(file.name).slice(0, 256),
    fileType: "application/pdf",
    fileSize: fileData.byteLength,
    fileData,
    createdBy: session.userId,
  }).returning({ id: categoryDocuments.id, title: categoryDocuments.title, fileName: categoryDocuments.fileName, fileSize: categoryDocuments.fileSize, createdAt: categoryDocuments.createdAt });
  return NextResponse.json({ document }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Tài liệu không hợp lệ." }, { status: 400 });
  const deleted = await db.delete(categoryDocuments).where(eq(categoryDocuments.id, id)).returning({ id: categoryDocuments.id });
  if (!deleted.length) return NextResponse.json({ error: "Không tìm thấy tài liệu." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
