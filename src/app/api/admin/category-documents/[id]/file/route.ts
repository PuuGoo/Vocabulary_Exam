import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { categoryDocuments } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { buildCategoryDocumentResponse } from "@/lib/categoryDocumentResponse";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Tài liệu không hợp lệ." }, { status: 400 });
  const [document] = await db.select().from(categoryDocuments).where(eq(categoryDocuments.id, id)).limit(1);
  if (!document) return NextResponse.json({ error: "Không tìm thấy tài liệu." }, { status: 404 });
  return buildCategoryDocumentResponse(document);
}
