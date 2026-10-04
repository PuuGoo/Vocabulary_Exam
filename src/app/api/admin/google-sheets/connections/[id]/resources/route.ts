import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { googleSheetConnections, googleSheetResources, vocabSets } from "@/db/schema";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { requireAdminResourceAccess } from "@/lib/folderAuthorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const access = await requireAdminPermission("google_sheets.view");
  if (isAuthorizationError(access)) return access;
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "Không tìm thấy kết nối." }, { status: 404 });
  const [connection] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, id)).limit(1);
  if (!connection) return NextResponse.json({ error: "Không tìm thấy kết nối." }, { status: 404 });
  const [set] = await db.select().from(vocabSets).where(eq(vocabSets.id, connection.setId)).limit(1);
  const scoped = await requireAdminResourceAccess({ permission: "google_sheets.view", folderId: set?.folderId, level: "viewer", access });
  if (isAuthorizationError(scoped)) return scoped;
  const resources = await db.select({ id: googleSheetResources.id, spreadsheetId: googleSheetResources.spreadsheetId, spreadsheetName: googleSheetResources.spreadsheetName, status: googleSheetResources.status, managedByLexora: googleSheetResources.managedByLexora, createdAt: googleSheetResources.createdAt, updatedAt: googleSheetResources.updatedAt })
    .from(googleSheetResources).where(eq(googleSheetResources.connectionId, id)).orderBy(desc(googleSheetResources.id)).limit(100);
  return NextResponse.json({ resources });
}
