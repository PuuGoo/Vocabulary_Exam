import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { attempts, users } from "@/db/schema";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";

export async function GET() {
  const access = await requireAdminPermission("results.view");
  if (isAuthorizationError(access)) return access;

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
    .orderBy(desc(attempts.createdAt));

  return NextResponse.json({ results: rows });
}
