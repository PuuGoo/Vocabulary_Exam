import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";

export type AdminAuditEvent = {
  actorUserId: number;
  action: string;
  resourceType: string;
  resourceId?: string | number | null;
  targetUserId?: number | null;
  metadata?: Record<string, unknown>;
};

export async function writeAdminAudit(event: AdminAuditEvent, executor: Pick<typeof db, "insert"> = db) {
  await executor.insert(adminAuditLogs).values({
    actorUserId: event.actorUserId,
    action: event.action,
    resourceType: event.resourceType,
    resourceId: event.resourceId == null ? null : String(event.resourceId),
    targetUserId: event.targetUserId ?? null,
    metadata: JSON.stringify(event.metadata ?? {}),
  });
}
