import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { categoryDocuments } from "@/db/schema";
import { getCategoryShareContent, getShareByToken } from "@/lib/shares";
import { hasShareAccess } from "@/lib/sharePassword";
import { buildCategoryDocumentResponse } from "@/lib/categoryDocumentResponse";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: { token: string; id: string } }) {
  const documentId = Number(params.id);
  let shareId: number | null = null;
  try {
    const share = await getShareByToken(params.token);
    shareId = share?.id || null;
    if (!share || share.targetType !== "question_collection" || !share.contentSelectionList.includes("documents") || !Number.isInteger(documentId) || documentId <= 0) return NextResponse.json({ error: "SHARED_DOCUMENT_NOT_FOUND" }, { status: 404 });
    if (!await hasShareAccess(share)) return NextResponse.json({ error: "Mật khẩu được yêu cầu.", code: "SHARE_PASSWORD_REQUIRED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    const content = await getCategoryShareContent(share.targetId);
    const allowed = content?.documents.some((item) => item.id === documentId) && (share.includeNewContent || share.contentSnapshotValue.documentIds.includes(documentId));
    if (!allowed) return NextResponse.json({ error: "SHARED_DOCUMENT_NOT_FOUND" }, { status: 404 });
    const [document] = await db.select({ fileName: categoryDocuments.fileName, fileType: categoryDocuments.fileType, fileData: categoryDocuments.fileData }).from(categoryDocuments).where(eq(categoryDocuments.id, documentId)).limit(1);
    if (!document) return NextResponse.json({ error: "SHARED_DOCUMENT_NOT_FOUND" }, { status: 404 });
    return buildCategoryDocumentResponse(document, "private, no-store");
  } catch (error) {
    console.error("[share:document]", { shareId, documentId, error });
    return NextResponse.json({ error: "SHARED_DOCUMENT_FAILED" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
