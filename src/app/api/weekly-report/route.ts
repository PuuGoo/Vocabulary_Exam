import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { attempts, dailyActivities, mistakes, vocabSets, wordProgress, words } from "@/db/schema";
import { dateInVietnam } from "@/lib/activity";
import { getSession } from "@/lib/auth";

function shiftDay(value: string, amount: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function inRange(date: string, start: string, end: string) {
  return date >= start && date < end;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requestedOffset = Number(req.nextUrl.searchParams.get("offset"));
  const offset = Number.isInteger(requestedOffset) ? Math.min(7, Math.max(0, requestedOffset)) : 0;
  const today = dateInVietnam();
  const todayDate = new Date(`${today}T00:00:00Z`);
  const mondayShift = (todayDate.getUTCDay() + 6) % 7;
  const start = shiftDay(today, -mondayShift - offset * 7);
  const end = shiftDay(start, 7);
  const previousStart = shiftDay(start, -7);
  const cutoff = new Date(`${shiftDay(previousStart, -1)}T00:00:00Z`);

  const [savedRows, progressRows, attemptRows, mistakeRows] = await Promise.all([
    db.select().from(dailyActivities).where(and(
      eq(dailyActivities.userId, session.userId),
      gte(dailyActivities.activityDate, previousStart)
    )),
    db.select({ at: wordProgress.updatedAt }).from(wordProgress).where(and(
      eq(wordProgress.userId, session.userId),
      gte(wordProgress.updatedAt, cutoff)
    )),
    db.select().from(attempts).where(and(
      eq(attempts.userId, session.userId),
      gte(attempts.createdAt, cutoff)
    )),
    db
      .select({
        id: mistakes.id,
        wordId: words.id,
        meaning: words.meaning,
        term: words.term,
        v1: words.v1,
        timesWrong: mistakes.timesWrong,
        lastWrongAt: mistakes.lastWrongAt,
        setId: vocabSets.id,
        setName: vocabSets.name,
      })
      .from(mistakes)
      .innerJoin(words, eq(words.id, mistakes.wordId))
      .innerJoin(vocabSets, eq(vocabSets.id, mistakes.setId))
      .where(and(eq(mistakes.userId, session.userId), gte(mistakes.lastWrongAt, cutoff)))
      .orderBy(desc(mistakes.timesWrong)),
  ]);

  const savedByDay = new Map(savedRows.map((row) => [row.activityDate, row]));
  const legacyWords = new Map<string, number>();
  const attemptsByDay = new Map<string, number>();
  progressRows.forEach((row) => {
    const day = dateInVietnam(row.at);
    legacyWords.set(day, (legacyWords.get(day) || 0) + 1);
  });
  attemptRows.forEach((row) => {
    const day = dateInVietnam(row.createdAt);
    attemptsByDay.set(day, (attemptsByDay.get(day) || 0) + 1);
  });

  function makeDays(rangeStart: string) {
    return Array.from({ length: 7 }, (_, index) => {
      const date = shiftDay(rangeStart, index);
      const saved = savedByDay.get(date);
      return {
        date,
        wordsReviewed: Math.max(saved?.wordsReviewed || 0, legacyWords.get(date) || 0),
        quizzesCompleted: Math.max(saved?.quizzesCompleted || 0, attemptsByDay.get(date) || 0),
      };
    });
  }

  function summarize(rangeStart: string, rangeEnd: string, days: ReturnType<typeof makeDays>) {
    const rangeAttempts = attemptRows.filter((row) => inRange(dateInVietnam(row.createdAt), rangeStart, rangeEnd));
    const totalScore = rangeAttempts.reduce((sum, row) => sum + row.score, 0);
    const totalQuestions = rangeAttempts.reduce((sum, row) => sum + row.total, 0);
    return {
      wordsReviewed: days.reduce((sum, day) => sum + day.wordsReviewed, 0),
      quizzesCompleted: rangeAttempts.length,
      activeDays: days.filter((day) => day.wordsReviewed > 0 || day.quizzesCompleted > 0).length,
      accuracy: totalQuestions > 0 ? Math.round((totalScore / totalQuestions) * 100) : null,
    };
  }

  const days = makeDays(start);
  const previousDays = makeDays(previousStart);
  const summary = summarize(start, end, days);
  const previous = summarize(previousStart, start, previousDays);
  const currentAttempts = attemptRows.filter((row) => inRange(dateInVietnam(row.createdAt), start, end));
  const modeCounts = new Map<string, number>();
  currentAttempts.forEach((row) => modeCounts.set(row.mode, (modeCounts.get(row.mode) || 0) + 1));
  const difficultWords = mistakeRows
    .filter((row) => inRange(dateInVietnam(row.lastWrongAt), start, end))
    .slice(0, 5)
    .map((row) => ({ ...row, answer: row.term || row.v1 || "" }));

  const recommendations: Array<{ title: string; detail: string; href: string }> = [];
  if (summary.activeDays < 3) recommendations.push({ title: "Tạo nhịp học đều hơn", detail: "Thử học ngắn 5–10 phút trong ít nhất 3 ngày mỗi tuần.", href: "/study" });
  if (summary.accuracy !== null && summary.accuracy < 70) recommendations.push({ title: "Ôn lại từ thường sai", detail: "Ưu tiên danh sách từ sai trước khi làm bài mới.", href: "/review" });
  if (!modeCounts.has("dictation")) recommendations.push({ title: "Bổ sung kỹ năng nghe", detail: "Thử một lượt Nghe & viết để luyện nhận diện âm và chính tả.", href: "/study" });
  if (!modeCounts.has("pronunciation")) recommendations.push({ title: "Luyện nói thành tiếng", detail: "Thử chế độ Luyện phát âm để nghe mẫu và kiểm tra giọng nói.", href: "/study" });
  if (!modeCounts.has("sentence")) recommendations.push({ title: "Học từ trong ngữ cảnh", detail: "Thử chế độ Xếp câu để ghi nhớ cách dùng từ trong câu hoàn chỉnh.", href: "/study" });
  if (recommendations.length === 0) recommendations.push({ title: "Duy trì phong độ", detail: "Bạn đang học khá cân bằng. Tiếp tục mục tiêu hiện tại trong tuần tới.", href: "/progress" });

  return NextResponse.json({
    offset,
    period: { start, end: shiftDay(end, -1) },
    days,
    summary,
    previous,
    modes: [...modeCounts].map(([mode, count]) => ({ mode, count })),
    difficultWords,
    recommendations: recommendations.slice(0, 3),
  });
}
