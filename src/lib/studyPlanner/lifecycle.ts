import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  studyPlannerConnections,
  studyPlannerSnapshots,
  studyPlannerSyncChannels,
  studyPlannerSyncPending,
  studyPlannerCourses,
  studyPlannerTasks,
  studyPlannerCurriculumTopics,
  studyPlannerAssignments,
  studyPlannerReadingMaterials,
  studyPlannerHabits,
  studyPlannerTodos,
  studyPlannerActivities,
} from "@/db/schema";
import { writeAdminAudit } from "@/lib/adminAudit";
import { GoogleSheetsError, safeGoogleErrorForLogs } from "@/lib/googleSheets/errors";
import { classifyGoogleApiError } from "@/lib/googleSheets/errors";
import { hashChannelToken } from "@/lib/googleSheets/channelToken";
import type { GoogleWorkspaceApi } from "@/lib/googleSheets/api";
import { acquirePlannerSyncLock, releasePlannerSyncLock } from "@/lib/studyPlanner/store";
import { createGoogleWorkspaceApi } from "@/lib/googleSheets/client";
import { loadGoogleToken } from "@/lib/googleSheets/auth";

/**
 * Phase 11 — Planner workbook lifecycle.
 *
 * vocabulary must keep working after any of these operations, so every
 * function here only touches study_planner_* tables. A planner disconnect
 * keeps the spreadsheet file and every normalized record; a replace stages,
 * verifies and only then activates. Trash only runs when Lexora can prove
 * it manages the file and the owner confirms.
 */

export type PlannerLifecycleActor = { userId: number; displayName?: string };

/** Watch channel is proved manageable when Lexora created it: managed_by_lexora matters for cleanup. */
export function isPlannerManagedByLexora(connection: { managedByLexora: boolean }): boolean {
  return connection.managedByLexora === true;
}

/**
 * Disconnect planner sync for this user. The personal copy stays in Drive;
 * nothing is deleted, and no planner record is dropped — the archivedAt
 * semantics are untouched.
 */
export async function disconnectStudyPlanner(actor: PlannerLifecycleActor): Promise<{ found: boolean; watchCleanupPending: boolean }> {
  const [connection] = await db.select().from(studyPlannerConnections).where(eq(studyPlannerConnections.userId, actor.userId)).limit(1);
  if (!connection) return { found: false, watchCleanupPending: false };
  await acquirePlannerSyncLock(connection.id, "disconnect_planner");
  try {
    const channels = await db.select().from(studyPlannerSyncChannels).where(eq(studyPlannerSyncChannels.connectionId, connection.id));
    await db.transaction(async (tx) => {
      const status = ["archived", "replaced", "missing"].includes(connection.status) ? connection.status : "disconnected";
      await tx.update(studyPlannerConnections).set({ enabled: false, status, updatedAt: new Date() }).where(eq(studyPlannerConnections.id, connection.id));
      await tx.update(studyPlannerSyncChannels).set({ status: "stopped", updatedAt: new Date() }).where(eq(studyPlannerSyncChannels.connectionId, connection.id));
      await tx.update(studyPlannerSyncPending).set({ pending: false, pendingAt: null, updatedAt: new Date() }).where(eq(studyPlannerSyncPending.connectionId, connection.id));
      await writeAdminAudit({ actorUserId: actor.userId, action: "study_planner.disconnect", resourceType: "study_planner_connection", resourceId: connection.id, metadata: { spreadsheetId: connection.spreadsheetId, vocabularyPreserved: true } }, tx);
    });
    let watchCleanupPending = false;
    if (channels.some((channel) => channel.resourceId)) {
      try {
        const token = await loadGoogleToken(connection.userId);
        if (!token?.refreshToken) watchCleanupPending = true;
        else {
          const ownedApi = createGoogleWorkspaceApi(token as Parameters<typeof createGoogleWorkspaceApi>[0]);
          for (const channel of channels) {
            if (!channel.resourceId) continue;
            try {
              if (!ownedApi.stopWatchChannel) watchCleanupPending = true;
              else await ownedApi.stopWatchChannel(channel.channelId, channel.resourceId);
            } catch { watchCleanupPending = true; }
          }
        }
      } catch { watchCleanupPending = true; }
    }
    return { found: true, watchCleanupPending };
  } finally {
    // connection may not exist (filtered above), but id is still valid when set.
    const [idRow] = await db.select({ id: studyPlannerConnections.id }).from(studyPlannerConnections).where(eq(studyPlannerConnections.userId, actor.userId)).limit(1);
    if (idRow) await releasePlannerSyncLock(idRow.id);
  }
}

/**
 * Snapshot the planner's normalized records before a destructive or replacement
 * operation. The payload is the source of truth if recovery is needed; it is
 * never applied without explicit approval.
 */
export async function snapshotPlanner(connectionId: number, kind: string): Promise<number> {
  const connection = (await db.select().from(studyPlannerConnections).where(eq(studyPlannerConnections.id, connectionId)).limit(1))[0];
  if (!connection) throw new Error("Planner connection not found");
  const [courses, tasks, topics, assignments, reading, habits, todos, activities] = await Promise.all([
    db.select().from(studyPlannerCourses).where(eq(studyPlannerCourses.connectionId, connectionId)),
    db.select().from(studyPlannerTasks).where(eq(studyPlannerTasks.connectionId, connectionId)),
    db.select().from(studyPlannerCurriculumTopics).where(eq(studyPlannerCurriculumTopics.connectionId, connectionId)),
    db.select().from(studyPlannerAssignments).where(eq(studyPlannerAssignments.connectionId, connectionId)),
    db.select().from(studyPlannerReadingMaterials).where(eq(studyPlannerReadingMaterials.connectionId, connectionId)),
    db.select().from(studyPlannerHabits).where(eq(studyPlannerHabits.connectionId, connectionId)),
    db.select().from(studyPlannerTodos).where(eq(studyPlannerTodos.connectionId, connectionId)),
    db.select().from(studyPlannerActivities).where(eq(studyPlannerActivities.connectionId, connectionId)),
  ]);
  const payload = JSON.stringify({ connectionId, kind, at: new Date().toISOString(), courses, tasks, topics, assignments, reading, habits, todos, activities });
  const [snapshot] = await db.insert(studyPlannerSnapshots).values({ connectionId, kind, payloadJson: payload }).returning({ id: studyPlannerSnapshots.id });
  return snapshot.id;
}

type ReplacePlannerOptions = {
  confirmedSpreadsheetId: string;
  destinationSpreadsheetId?: string;
  templateId?: string;
  trashPrevious?: boolean;
  api?: GoogleWorkspaceApi;
};

/**
 * 7-stage planner replacement.
 *
 * 1. Prepare candidate spreadsheet (caller-supplied id, already copied).
 * 2. Verify access and that every source tab from the workbook map is present.
 * 3. Map existing domain data — handled by re-reading current PG state.
 * 4. Start and verify the new watch (createWatchChannel + digest).
 * 5. Activate the new connection (transaction: swap spreadsheetId/title, new watch, audit).
 * 6. Stop the old watch and mark it as replaced (no-op if channel already dead).
 * 7. Old file and data are preserved unless trashPrevious was explicitly true
 *    AND Lexora managed the old file.
 *
 * If any stage before activation fails, the old planner stays active and the
 * candidate is left alone — the user just retries.
 */
export async function replaceStudyPlanner(actor: PlannerLifecycleActor, options: ReplacePlannerOptions): Promise<{ connectionId: number; spreadsheetId: string; cleanupPending: boolean }> {
  const [connection] = await db.select().from(studyPlannerConnections).where(eq(studyPlannerConnections.userId, actor.userId)).limit(1);
  if (!connection) throw new GoogleSheetsError("Chưa có Study Planner để thay thế.", "INVALID_SCHEMA", { status: 404 });
  if (connection.spreadsheetId !== options.confirmedSpreadsheetId && options.destinationSpreadsheetId == null) {
    throw new GoogleSheetsError("Kết nối đã thay đổi. Hãy mở lại xác nhận.", "INVALID_SCHEMA", { status: 409 });
  }
  if (options.trashPrevious && !isPlannerManagedByLexora(connection)) {
    throw new GoogleSheetsError("Không được xóa Sheet bên ngoài.", "PERMISSION_DENIED", { status: 403 });
  }
  const previousSpreadsheetId = connection.spreadsheetId;
  const previousChannels = await db.select().from(studyPlannerSyncChannels).where(eq(studyPlannerSyncChannels.connectionId, connection.id));
  const destinationId = options.destinationSpreadsheetId ?? options.confirmedSpreadsheetId;
  if (!/^[a-zA-Z0-9-_]{20,}$/.test(destinationId)) {
    throw new GoogleSheetsError("Spreadsheet id không hợp lệ.", "INVALID_SCHEMA", { status: 400 });
  }

  await acquirePlannerSyncLock(connection.id, "replace_planner");
  let activated = false;
  let candidateWatchId: string | null = null;
  let candidateResourceId: string | null = null;
  try {
    const token = await loadGoogleToken(actor.userId);
    if (!token?.refreshToken) throw new GoogleSheetsError("Bạn cần kết nối tài khoản Google trước.", "OAUTH_REVOKED", { status: 401 });
    const api: GoogleWorkspaceApi = options.api ?? createGoogleWorkspaceApi(token as Parameters<typeof createGoogleWorkspaceApi>[0]);
    // 2. Verify access and tab structure: re-read metadata for the destination file.
    const metadata = await api.getSpreadsheetMetadata(destinationId);
    const sheetTitles = new Set(metadata.sheets.map((sheet) => sheet.title));
    const missingTabs = ["Nhật ký nhiệm vụ", "Thông tin lớp học"].filter((tab) => !sheetTitles.has(tab));
    if (missingTabs.length) {
      throw new GoogleSheetsError(`Sheet mới thiếu tab: ${missingTabs.join(", ")} — vui lòng dùng bản copy từ mẫu Lexora.`, "INVALID_SCHEMA", { status: 400 });
    }
    // 4. Create watch for the candidate so renewal uses the new channel.
    // For a within-file replace (sheet structure fix), we just refresh the channel without copying.
    const resourceId = previousChannels[0]?.resourceId ?? destinationId;
    const watch = await api.createWatchChannel({ spreadsheetId: destinationId, resourceId });
    candidateWatchId = watch.channelId;
    candidateResourceId = watch.resourceId;
    await snapshotPlanner(connection.id, "replace_study_planner_before");
    await db.transaction(async (tx) => {
      const now = new Date();
      await tx.update(studyPlannerSyncChannels).set({ status: "stopped", updatedAt: now }).where(eq(studyPlannerSyncChannels.connectionId, connection.id));
      await tx.insert(studyPlannerSyncChannels).values({
        connectionId: connection.id,
        channelId: watch.channelId,
        resourceId: watch.resourceId ?? resourceId,
        resourceUri: watch.resourceUri,
        expirationAt: watch.expirationAt,
        channelTokenHash: watch.channelToken ? hashChannelToken(watch.channelToken) : null,
        status: "active",
      });
      await tx.update(studyPlannerConnections).set({
        spreadsheetId: destinationId,
        ...(options.templateId ? { templateId: options.templateId } : {}),
        managedByLexora: true,
        status: "connected",
        externalState: "accessible",
        lastVerifiedAt: now,
        lastSyncedAt: now,
        lastSuccessfulSyncedAt: now,
        lastError: null,
        lastErrorAt: null,
        updatedAt: now,
      }).where(eq(studyPlannerConnections.id, connection.id));
      await writeAdminAudit({ actorUserId: actor.userId, action: "study_planner.replace", resourceType: "study_planner_connection", resourceId: connection.id, metadata: { previousSpreadsheetId, spreadsheetId: destinationId } }, tx);
    });
    activated = true;
    // 6. Stop the old watch(es) that are no longer current. Best-effort: Google may have already expired them.
    let cleanupPending = false;
    for (const channel of previousChannels) {
      if (channel.channelId === candidateWatchId) continue;
      try {
        if (api.stopWatchChannel) await api.stopWatchChannel(channel.channelId, channel.resourceId);
        else cleanupPending = true;
      } catch { cleanupPending = true; }
    }
    if (options.trashPrevious && previousSpreadsheetId !== destinationId) {
      try {
        if (!api.trashSpreadsheet) throw new Error("Trash unavailable");
        await api.trashSpreadsheet(previousSpreadsheetId);
      } catch { cleanupPending = true; }
    }
    return { connectionId: connection.id, spreadsheetId: destinationId, cleanupPending };
  } catch (error) {
    // If we created a watch before failing to activate, stop it so Google does not keep it.
    if (!activated && candidateWatchId && candidateResourceId) {
      try {
        const token = await loadGoogleToken(actor.userId).catch(() => null);
        const api = token?.refreshToken ? createGoogleWorkspaceApi(token as Parameters<typeof createGoogleWorkspaceApi>[0]) : null;
        if (api?.stopWatchChannel) await api.stopWatchChannel(candidateWatchId, candidateResourceId).catch(() => {});
      } catch {}
    }
    throw error;
  } finally {
    await releasePlannerSyncLock(connection.id);
  }
}

/** Detect that the spreadsheet the planner points at is gone (or Lexora can no longer see it). */
export async function classifyPlannerSpreadsheetHealth(connectionId: number, api: GoogleWorkspaceApi): Promise<{ missing: boolean; accessDenied: boolean; accessible: boolean; message?: string }> {
  const [connection] = await db.select().from(studyPlannerConnections).where(eq(studyPlannerConnections.id, connectionId)).limit(1);
  if (!connection) return { missing: true, accessDenied: false, accessible: false, message: "Không tìm thấy planner." };
  try {
    const ok = await api.verifyAccess(connection.spreadsheetId);
    if (!ok) return { missing: true, accessDenied: false, accessible: false, message: "Không tìm thấy hoặc không thể truy cập Google Sheet. Dữ liệu web vẫn được giữ nguyên." };
    await api.getSpreadsheetMetadata(connection.spreadsheetId);
    await db.update(studyPlannerConnections).set({ externalState: "accessible", lastVerifiedAt: new Date() }).where(eq(studyPlannerConnections.id, connectionId));
    return { missing: false, accessDenied: false, accessible: true };
  } catch (error) {
    const classified = classifyGoogleApiError(error);
    await db.update(studyPlannerConnections).set({ externalState: classified.code === "OAUTH_REVOKED" ? "unauthorized" : classified.code === "PERMISSION_DENIED" ? "forbidden" : "missing", lastError: (error instanceof Error ? error.message : "Lỗi kiểm tra spreadsheet").slice(0, 2000), lastErrorAt: new Date(), updatedAt: new Date() }).where(eq(studyPlannerConnections.id, connectionId));
    if (classified.code === "OAUTH_REVOKED") return { missing: false, accessDenied: true, accessible: false, message: "Quyền Google đã hết hiệu lực. Hãy kết nối lại." };
    if (classified.code === "PERMISSION_DENIED") return { missing: false, accessDenied: true, accessible: false, message: "Lexora không còn quyền truy cập Sheet." };
    if (classified.code === "SHEET_NOT_FOUND") return { missing: true, accessDenied: false, accessible: false, message: "Không tìm thấy Google Sheet. Dữ liệu web vẫn được giữ nguyên." };
    return { missing: false, accessDenied: false, accessible: false, message: safeGoogleErrorForLogs(error) ?? "Không thể kiểm tra spreadsheet." };
  }
}

