import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { requireAdminResourceAccess } from "@/lib/folderAuthorization";
import { db } from "@/db";
import { googleSheetConnections, googleSheetSyncChannels, vocabSets } from "@/db/schema";
import { writeAdminAudit } from "@/lib/adminAudit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  deleteBehavior: z.enum(["archive", "delete", "ignore"]).optional(),
  // Whether Lexora planted (or should plant) the native Sheets AI formulas.
  // Purely a template switch: no AI API is ever called by Lexora.
  aiEnrich: z.boolean().optional(),
  status: z.enum(["connected", "paused", "error", "disconnected"]).optional(),
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireAdminPermission("google_sheets.view");
  if (isAuthorizationError(access)) return access;
  const connectionId = Number(params.id);
  const [connection] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, connectionId)).limit(1);
  if (!connection) return NextResponse.json({ error: "Không tìm thấy kết nối." }, { status: 404 });
  const [set] = await db.select().from(vocabSets).where(eq(vocabSets.id, connection.setId)).limit(1);
  const scoped = await requireAdminResourceAccess({ permission: "google_sheets.view", folderId: set?.folderId ?? null, level: "viewer", access });
  if (isAuthorizationError(scoped)) return scoped;
  const [channel] = await db.select().from(googleSheetSyncChannels).where(eq(googleSheetSyncChannels.connectionId, connectionId)).limit(1);
  return NextResponse.json({ connection: { ...connection, setName: set?.name ?? null }, channel: channel ?? null });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireAdminPermission("google_sheets.manage");
  if (isAuthorizationError(access)) return access;
  const connectionId = Number(params.id);
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  const [connection] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, connectionId)).limit(1);
  if (!connection) return NextResponse.json({ error: "Không tìm thấy kết nối." }, { status: 404 });
  const [set] = await db.select().from(vocabSets).where(eq(vocabSets.id, connection.setId)).limit(1);
  const scoped = await requireAdminResourceAccess({ permission: "google_sheets.manage", folderId: set?.folderId ?? null, level: "editor", access });
  if (isAuthorizationError(scoped)) return scoped;
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.enabled !== undefined) patch.enabled = parsed.data.enabled;
  if (parsed.data.deleteBehavior !== undefined) patch.deleteBehavior = parsed.data.deleteBehavior;
  if (parsed.data.aiEnrich !== undefined) patch.aiEnrich = parsed.data.aiEnrich;
  if (parsed.data.status !== undefined) { patch.status = parsed.data.status; patch.enabled = parsed.data.status === "paused" ? false : parsed.data.status === "disconnected" ? false : true; }
  await db.update(googleSheetConnections).set(patch).where(eq(googleSheetConnections.id, connectionId));
  const [updated] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, connectionId)).limit(1);
  await writeAdminAudit({ actorUserId: access.userId, action: parsed.data.enabled === false || parsed.data.status === "paused" ? "google_sheet.pause" : parsed.data.status === "disconnected" ? "google_sheet.disconnect" : "google_sheet.update", resourceType: "google_sheet_connection", resourceId: connectionId, metadata: { setId: connection.setId, changes: parsed.data } });
  return NextResponse.json({ connection: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireAdminPermission("google_sheets.manage");
  if (isAuthorizationError(access)) return access;
  const connectionId = Number(params.id);
  const [connection] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, connectionId)).limit(1);
  if (!connection) return NextResponse.json({ error: "Không tìm thấy kết nối." }, { status: 404 });
  const [set] = await db.select().from(vocabSets).where(eq(vocabSets.id, connection.setId)).limit(1);
  const scoped = await requireAdminResourceAccess({ permission: "google_sheets.manage", folderId: set?.folderId ?? null, level: "editor", access });
  if (isAuthorizationError(scoped)) return scoped;
  await db.update(googleSheetConnections).set({ enabled: false, status: "disconnected", updatedAt: new Date() }).where(eq(googleSheetConnections.id, connectionId));
  await writeAdminAudit({ actorUserId: access.userId, action: "google_sheet.disconnect", resourceType: "google_sheet_connection", resourceId: connectionId, metadata: { setId: connection.setId, spreadsheetId: connection.spreadsheetId } });
  return NextResponse.json({ ok: true });
}
