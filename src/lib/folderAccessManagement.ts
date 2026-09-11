import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs, contentFolders, folderAccess, users } from "@/db/schema";
import type { FolderAccessLevel } from "@/lib/folderAuthorizationCore";

export type FolderAccessChange = { userId: number; accessLevel: FolderAccessLevel | null };
export type FolderAccessActor = { userId: number; displayName: string };

export type FolderAccessChangeResult =
  | { ok: true; changed: number }
  | { ok: false; code: "FOLDER_NOT_FOUND" | "INVALID_TARGET" | "PROTECTED_TARGET"; userIds?: number[] };

export async function applyFolderAccessChanges(
  actor: FolderAccessActor,
  folderId: number,
  changes: readonly FolderAccessChange[],
): Promise<FolderAccessChangeResult> {
  return db.transaction(async (tx) => {
    const [folder] = await tx
      .select({ id: contentFolders.id, ownerUserId: contentFolders.ownerUserId })
      .from(contentFolders)
      .where(eq(contentFolders.id, folderId))
      .limit(1);
    if (!folder) return { ok: false as const, code: "FOLDER_NOT_FOUND" as const };

    const uniqueIds = [...new Set(changes.map((change) => change.userId))];
    if (uniqueIds.length !== changes.length) {
      return { ok: false as const, code: "INVALID_TARGET" as const, userIds: uniqueIds };
    }
    const targets = uniqueIds.length
      ? await tx
          .select({ id: users.id, role: users.role, adminProfile: users.adminProfile })
          .from(users)
          .where(inArray(users.id, uniqueIds))
      : [];
    const targetById = new Map(targets.map((target) => [target.id, target]));
    const invalid = uniqueIds.filter((id) => targetById.get(id)?.role !== "admin");
    if (invalid.length) return { ok: false as const, code: "INVALID_TARGET" as const, userIds: invalid };
    const protectedIds = uniqueIds.filter((id) => id === actor.userId || id === folder.ownerUserId || targetById.get(id)?.adminProfile === "owner");
    if (protectedIds.length) return { ok: false as const, code: "PROTECTED_TARGET" as const, userIds: protectedIds };

    const beforeRows = uniqueIds.length
      ? await tx
          .select({ userId: folderAccess.userId, accessLevel: folderAccess.accessLevel })
          .from(folderAccess)
          .where(and(eq(folderAccess.folderId, folderId), inArray(folderAccess.userId, uniqueIds)))
      : [];
    const beforeByUser = new Map(beforeRows.map((row) => [row.userId, row.accessLevel]));
    let changed = 0;

    for (const change of changes) {
      const before = beforeByUser.get(change.userId) ?? null;
      if (before === change.accessLevel) continue;
      if (change.accessLevel === null) {
        await tx.delete(folderAccess).where(and(eq(folderAccess.folderId, folderId), eq(folderAccess.userId, change.userId)));
      } else {
        await tx
          .insert(folderAccess)
          .values({ folderId, userId: change.userId, accessLevel: change.accessLevel, grantedBy: actor.userId })
          .onConflictDoUpdate({
            target: [folderAccess.folderId, folderAccess.userId],
            set: { accessLevel: change.accessLevel, grantedBy: actor.userId, updatedAt: new Date() },
          });
      }
      await tx.insert(adminAuditLogs).values({
        actorUserId: actor.userId,
        actorDisplayName: actor.displayName,
        action: change.accessLevel === null ? "folder.access.revoke" : before === null ? "folder.access.grant" : "folder.access.change",
        resourceType: "folder",
        resourceId: String(folderId),
        targetUserId: change.userId,
        metadata: JSON.stringify({ before, after: change.accessLevel }),
      });
      changed += 1;
    }
    return { ok: true as const, changed };
  });
}
