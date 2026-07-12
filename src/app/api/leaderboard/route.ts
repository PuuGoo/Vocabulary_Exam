import { NextResponse } from "next/server";
import { sql, eq } from "drizzle-orm";
import { db } from "@/db";
import { attempts, users } from "@/db/schema";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select({
      userId: users.id,
      username: users.username,
      displayName: users.displayName,
      attemptCount: sql<number>`count(${attempts.id})::int`,
      totalScore: sql<number>`coalesce(sum(${attempts.score}), 0)::int`,
      totalQuestions: sql<number>`coalesce(sum(${attempts.total}), 0)::int`,
    })
    .from(users)
    .innerJoin(attempts, eq(attempts.userId, users.id))
    .where(eq(users.role, "student"))
    .groupBy(users.id)
    .having(sql`count(${attempts.id}) > 0`);

  const ranked = rows
    .map((r) => ({
      ...r,
      accuracy: r.totalQuestions > 0 ? Math.round((r.totalScore / r.totalQuestions) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.accuracy - a.accuracy || b.attemptCount - a.attemptCount)
    .slice(0, 50);

  return NextResponse.json({ leaderboard: ranked, me: session.userId });
}
