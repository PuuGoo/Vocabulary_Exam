import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { attempts, wordBookmarks, wordProgress } from "@/db/schema";
import { getSession } from "@/lib/auth";

type Achievement = {
  id: string;
  icon: string;
  title: string;
  description: string;
  current: number;
  target: number;
  unit: string;
};

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [knownRows, bookmarkRows, attemptRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(wordProgress)
      .where(and(eq(wordProgress.userId, session.userId), eq(wordProgress.known, true))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(wordBookmarks)
      .where(eq(wordBookmarks.userId, session.userId)),
    db
      .select({
        count: sql<number>`count(*)::int`,
        bestAccuracy: sql<number>`coalesce(max(case when ${attempts.total} > 0 then round(${attempts.score} * 100.0 / ${attempts.total}) else 0 end), 0)::int`,
        matchCount: sql<number>`count(*) filter (where ${attempts.mode} = 'match')::int`,
        dictationCount: sql<number>`count(*) filter (where ${attempts.mode} = 'dictation')::int`,
      })
      .from(attempts)
      .where(eq(attempts.userId, session.userId)),
  ]);

  const known = knownRows[0]?.count || 0;
  const bookmarks = bookmarkRows[0]?.count || 0;
  const stats = attemptRows[0] || { count: 0, bestAccuracy: 0, matchCount: 0, dictationCount: 0 };
  const definitions: Achievement[] = [
    { id: "first_attempt", icon: "🌱", title: "Khởi đầu tốt", description: "Hoàn thành bài luyện đầu tiên", current: stats.count, target: 1, unit: "bài" },
    { id: "ten_attempts", icon: "🔥", title: "Chăm chỉ", description: "Hoàn thành 10 lượt luyện tập", current: stats.count, target: 10, unit: "bài" },
    { id: "high_score", icon: "🎯", title: "Chính xác", description: "Đạt ít nhất 90% trong một bài", current: stats.bestAccuracy, target: 90, unit: "%" },
    { id: "known_25", icon: "📚", title: "Vốn từ vững vàng", description: "Đánh dấu đã nhớ 25 từ", current: known, target: 25, unit: "từ" },
    { id: "known_100", icon: "🏆", title: "Bậc thầy từ vựng", description: "Đánh dấu đã nhớ 100 từ", current: known, target: 100, unit: "từ" },
    { id: "notebook_10", icon: "⭐", title: "Nhà sưu tầm", description: "Lưu 10 từ vào sổ tay", current: bookmarks, target: 10, unit: "từ" },
    { id: "match_3", icon: "🧩", title: "Ghép cặp nhanh nhạy", description: "Hoàn thành 3 trò chơi ghép cặp", current: stats.matchCount, target: 3, unit: "lượt" },
    { id: "dictation_3", icon: "🎧", title: "Đôi tai tinh tường", description: "Hoàn thành 3 bài nghe và viết", current: stats.dictationCount, target: 3, unit: "bài" },
  ];
  const achievements = definitions.map((item) => ({
    ...item,
    unlocked: item.current >= item.target,
    progress: Math.min(100, Math.round((item.current / item.target) * 100)),
  }));

  return NextResponse.json({
    achievements,
    unlocked: achievements.filter((item) => item.unlocked).length,
    total: achievements.length,
  });
}
