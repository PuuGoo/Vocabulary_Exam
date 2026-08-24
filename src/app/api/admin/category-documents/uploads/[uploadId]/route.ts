import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { categoryDocumentUploads } from "@/db/schema";
import { getSession } from "@/lib/auth";

export async function DELETE(_request: Request, { params }: { params: { uploadId: string } }) {
  const session = await getSession();
  if (!session || session.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
  await db.delete(categoryDocumentUploads).where(and(
    eq(categoryDocumentUploads.id, params.uploadId), eq(categoryDocumentUploads.createdBy, session.userId),
  ));
  return Response.json({ ok: true });
}
