import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { attempts, users } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { dateInVietnam } from "@/lib/activity";

function startOfPeriod(period: string) {
  if (period === "all") return null;
  const today = new Date(`${dateInVietnam()}T00:00:00+07:00`);
  if (period === "30d") return new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
  const daysSinceMonday = (today.getUTCDay() + 6) % 7;
  return new Date(today.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000);
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requested = req.nextUrl.searchParams.get("period");
  const period = requested === "all" || requested === "30d" ? requested : "week";
  const start = startOfPeriod(period);
  const conditions = [sql`${attempts.total} > 0`];
  if (start) conditions.push(gte(attempts.createdAt, start));

  const rows = await db
    .select({
      userId: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      attemptCount: sql<number>`count(${attempts.id})::int`,
      totalScore: sql<number>`coalesce(sum(${attempts.score}), 0)::int`,
      totalQuestions: sql<number>`coalesce(sum(${attempts.total}), 0)::int`,
    })
    .from(users)
    .innerJoin(attempts, eq(attempts.userId, users.id))
    .where(and(...conditions))
    .groupBy(users.id)
    .having(sql`count(${attempts.id}) > 0`);

  const ranked = rows
    .map((row) => {
      const accuracy = row.totalQuestions > 0 ? Math.round((row.totalScore / row.totalQuestions) * 1000) / 10 : 0;
      return { ...row, accuracy, xp: row.totalScore * 10 + row.attemptCount * 5 };
    })
    .sort((a, b) => b.xp - a.xp || b.accuracy - a.accuracy || b.attemptCount - a.attemptCount)
    .map((row, index) => ({ ...row, rank: index + 1 }));

  const mine = ranked.find((row) => row.userId === session.userId) || null;
  return NextResponse.json({
    leaderboard: ranked.slice(0, 50),
    me: session.userId,
    mine,
    participantCount: ranked.length,
    period,
    periodStart: start ? dateInVietnam(start) : null,
  });
}
