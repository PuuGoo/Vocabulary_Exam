import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { requireAdminResourceAccess } from "@/lib/folderAuthorization";
import { db } from "@/db";
import { googleSheetConnections, googleSheetSyncRuns, vocabSets } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireAdminPermission("google_sheets.view");
  if (isAuthorizationError(access)) return access;
  const connectionId = Number(params.id);
  const [connection] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, connectionId)).limit(1);
  if (!connection) return NextResponse.json({ error: "Không tìm thấy kết nối." }, { status: 404 });
  const [set] = await db.select().from(vocabSets).where(eq(vocabSets.id, connection.setId)).limit(1);
  const scoped = await requireAdminResourceAccess({ permission: "google_sheets.view", folderId: set?.folderId ?? null, level: "viewer", access });
  if (isAuthorizationError(scoped)) return scoped;
  const limit = Math.min(50, Math.max(1, Number(new URL(req.url).searchParams.get("limit")) || 20));
  const runs = await db.select().from(googleSheetSyncRuns).where(eq(googleSheetSyncRuns.connectionId, connectionId)).orderBy(desc(googleSheetSyncRuns.startedAt)).limit(limit);
  return NextResponse.json({ runs: runs.slice(0, limit) });
}
