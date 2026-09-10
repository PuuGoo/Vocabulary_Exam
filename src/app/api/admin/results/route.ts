import { NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { attempts, users, vocabSets } from "@/db/schema";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { getVisibleFolderIds } from "@/lib/folderAuthorization";

export async function GET() {
  const access = await requireAdminPermission("results.view");
  if (isAuthorizationError(access)) return access;
  const visibleFolderIds = await getVisibleFolderIds(access);
  if (visibleFolderIds.length === 0) return NextResponse.json({ results: [] });

  const rows = await db
    .select({
      id: attempts.id,
      setName: attempts.setName,
      mode: attempts.mode,
      score: attempts.score,
      total: attempts.total,
      timed: attempts.timed,
      durationSeconds: attempts.durationSeconds,
      createdAt: attempts.createdAt,
      username: users.username,
      displayName: users.displayName,
    })
    .from(attempts)
    .innerJoin(users, eq(attempts.userId, users.id))
    .innerJoin(vocabSets, eq(attempts.setId, vocabSets.id))
    .where(inArray(vocabSets.folderId, visibleFolderIds))
    .orderBy(desc(attempts.createdAt));

  return NextResponse.json({ results: rows });
}
