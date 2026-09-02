import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { categoryDocuments } from "@/db/schema";
import { getCategoryShareContent, getShareByToken } from "@/lib/shares";
import { hasShareAccess } from "@/lib/sharePassword";

export async function GET(_: Request, { params }: { params: { token: string; id: string } }) {
  const share = await getShareByToken(params.token);
  const documentId = Number(params.id);
  if (!share || share.targetType !== "question_collection" || !share.contentSelectionList.includes("documents") || !Number.isInteger(documentId) || documentId <= 0) return NextResponse.json({ error: "SHARED_DOCUMENT_NOT_FOUND" }, { status: 404 });
  if (!await hasShareAccess(share)) return NextResponse.json({ error: "Mật khẩu được yêu cầu.", code: "SHARE_PASSWORD_REQUIRED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const content = await getCategoryShareContent(share.targetId);
  const allowed = content?.documents.some((item) => item.id === documentId) && (share.includeNewContent || share.contentSnapshotValue.documentIds.includes(documentId));
  if (!allowed) return NextResponse.json({ error: "SHARED_DOCUMENT_NOT_FOUND" }, { status: 404 });
  const [document] = await db.select({ fileName: categoryDocuments.fileName, fileType: categoryDocuments.fileType, fileData: categoryDocuments.fileData }).from(categoryDocuments).where(eq(categoryDocuments.id, documentId)).limit(1);
  if (!document) return NextResponse.json({ error: "SHARED_DOCUMENT_NOT_FOUND" }, { status: 404 });
  const safeName = document.fileName.replace(/[\r\n"\\]/g, "_");
  return new NextResponse(document.fileData, { headers: { "Content-Type": document.fileType || "application/octet-stream", "Content-Disposition": `inline; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(document.fileName)}`, "Cache-Control": "private, max-age=60", "X-Content-Type-Options": "nosniff" } });
}
