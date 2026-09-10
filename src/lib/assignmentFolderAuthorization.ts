import { eq } from "drizzle-orm";
import { db } from "@/db";
import { assignments, vocabSets } from "@/db/schema";
import type { AdminAccess } from "@/lib/adminAuthorization";
import type { AdminPermission } from "@/lib/adminPermissions";
import { requireAdminResourceAccess } from "@/lib/folderAuthorization";

export async function requireAssignmentFolderAccess(access: AdminAccess, assignmentId: number, permission: AdminPermission) {
  const [resource] = await db.select({ folderId: vocabSets.folderId })
    .from(assignments).innerJoin(vocabSets, eq(vocabSets.id, assignments.setId))
    .where(eq(assignments.id, assignmentId)).limit(1);
  return requireAdminResourceAccess({ permission, folderId: resource?.folderId ?? null, level: "viewer", access });
}
