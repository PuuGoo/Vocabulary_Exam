import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { requireAdminResourceAccess } from "@/lib/folderAuthorization";
import { db } from "@/db";
import { googleSheetConnections, googleSheetSyncChannels, vocabSets } from "@/db/schema";
import { writeAdminAudit } from "@/lib/adminAudit";
import { normalizeAiPrompt } from "@/lib/googleSheets/aiFormula";
import { disconnectGoogleSheet } from "@/lib/googleSheets/disconnect";
import { acquireConnectionLock, releaseConnectionLock, SyncInProgressError } from "@/lib/googleSheets/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  conflictPolicy: z.enum(["review", "sheet"]).optional(),
  deleteBehavior: z.enum(["archive", "delete", "ignore"]).optional(),
  // Whether Lexora planted (or should plant) the native Sheets AI formulas.
  // Purely a template switch: no AI API is ever called by Lexora.
  aiEnrich: z.boolean().optional(),
  // Admin-authored instruction text per AI column, stored as JSON. Google
  // Sheets still executes the formula; this only changes its wording.
  aiPrompts: z.record(z.string(), z.string()).optional(),
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
  const [channel] = await db.select().from(googleSheetSyncChannels).where(and(eq(googleSheetSyncChannels.connectionId, connectionId), eq(googleSheetSyncChannels.status, "active"))).limit(1);
  return NextResponse.json({
    connection: { ...connection, setName: set?.name ?? null },
    channel: channel ? {
      id: channel.id,
      connectionId: channel.connectionId,
      channelId: channel.channelId,
      resourceId: channel.resourceId,
      expirationAt: channel.expirationAt,
      lastMessageNumber: channel.lastMessageNumber,
      status: channel.status,
      updatedAt: channel.updatedAt,
    } : null,
  });
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
  if (parsed.data.status === "disconnected") {
    try {
      const result = await disconnectGoogleSheet(connectionId, access.userId);
      const [updated] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, connectionId)).limit(1);
      return NextResponse.json({ connection: updated, watchCleanupPending: result.watchCleanupPending });
    } catch (error) {
      if (error instanceof SyncInProgressError) return NextResponse.json({ error: "Đồng bộ đang chạy. Vui lòng thử lại." }, { status: 409 });
      throw error;
    }
  }
  try {
    await acquireConnectionLock(connectionId, "settings");
  } catch (error) {
    if (error instanceof SyncInProgressError) return NextResponse.json({ error: "Đồng bộ đang chạy. Vui lòng thử lại." }, { status: 409 });
    throw error;
  }
  try {
  const [current] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, connectionId)).limit(1);
  if (!current || ["archived", "replaced", "missing", "disconnected"].includes(current.status)) {
    return NextResponse.json({ error: "Kết nối không còn hoạt động. Hãy dùng chức năng khôi phục hoặc thay Sheet." }, { status: 409 });
  }
  if (parsed.data.enabled !== undefined) patch.enabled = parsed.data.enabled;
  if (parsed.data.conflictPolicy !== undefined) patch.conflictPolicy = parsed.data.conflictPolicy;
  if (parsed.data.deleteBehavior !== undefined) patch.deleteBehavior = parsed.data.deleteBehavior;
  if (parsed.data.aiEnrich !== undefined) patch.aiEnrich = parsed.data.aiEnrich;
  if (parsed.data.aiPrompts !== undefined) {
    // Normalize and drop unusable values server-side; the UI shows only what
    // was actually accepted so the stored JSON always parses back cleanly.
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed.data.aiPrompts)) {
      const prompt = normalizeAiPrompt(value);
      if (prompt) normalized[key] = prompt;
    }
    patch.aiPrompts = Object.keys(normalized).length ? JSON.stringify(normalized) : null;
  }
  if (parsed.data.status !== undefined) { patch.status = parsed.data.status; patch.enabled = parsed.data.status !== "paused"; }
  await db.update(googleSheetConnections).set(patch).where(eq(googleSheetConnections.id, connectionId));
  const [updated] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, connectionId)).limit(1);
  await writeAdminAudit({ actorUserId: access.userId, action: parsed.data.enabled === false || parsed.data.status === "paused" ? "google_sheet.pause" : "google_sheet.update", resourceType: "google_sheet_connection", resourceId: connectionId, metadata: { setId: connection.setId, changes: parsed.data } });
  return NextResponse.json({ connection: updated });
  } finally {
    await releaseConnectionLock(connectionId);
  }
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
  try {
    const result = await disconnectGoogleSheet(connectionId, access.userId);
    return NextResponse.json({ ok: true, vocabularyPreserved: true, watchCleanupPending: result.watchCleanupPending });
  } catch (error) {
    if (error instanceof SyncInProgressError) return NextResponse.json({ error: "Đồng bộ đang chạy. Vui lòng thử lại." }, { status: 409 });
    throw error;
  }
}
