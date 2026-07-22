"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cx } from "@/components/ui";
import { toast } from "@/components/Toast";

type SetProgress = {
  id: number;
  name: string;
  type: string;
  totalWords: number;
  reviewed: number;
  known: number;
  needsReview: number;
  attempts: number;
  accuracy: number | null;
  lastAttemptAt: string | null;
};

type GoalSummary = {
  dailyWords: number;
  todayWords: number;
  streak: number;
  completed: boolean;
};

type ActivitySummary = {
  days: Array<{
    date: string;
    wordsReviewed: number;
    quizzesCompleted: number;
    level: 0 | 1 | 2 | 3;
  }>;
  summary: { activeDays: number; weekWords: number; weekQuizzes: number };
};

type AchievementSummary = {
  achievements: Array<{
    id: string;
    icon: string;
    title: string;
    description: string;
    current: number;
    target: number;
    unit: string;
    unlocked: boolean;
    progress: number;
  }>;
  unlocked: number;
  total: number;
};

export default function ProgressPage() {
  const [sets, setSets] = useState<SetProgress[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [goal, setGoal] = useState<GoalSummary | null>(null);
  const [goalInput, setGoalInput] = useState("10");
  const [savingGoal, setSavingGoal] = useState(false);
  const [activity, setActivity] = useState<ActivitySummary | null>(null);
  const [achievementSummary, setAchievementSummary] = useState<AchievementSummary | null>(null);

  async function load() {
    setSets(null);
    setLoadError(false);
    try {
      const [res, goalRes, activityRes, achievementRes] = await Promise.all([
        fetch("/api/progress"),
        fetch("/api/goals").catch(() => null),
        fetch("/api/activity").catch(() => null),
        fetch("/api/achievements").catch(() => null),
      ]);
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      setSets(data.sets || []);
      if (goalRes?.ok) {
        const goalData = await goalRes.json();
        setGoal(goalData);
        setGoalInput(String(goalData.dailyWords));
      }
      if (activityRes?.ok) setActivity(await activityRes.json());
      if (achievementRes?.ok) setAchievementSummary(await achievementRes.json());
    } catch {
      setSets([]);
      setLoadError(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveGoal() {
    const dailyWords = Number(goalInput);
    if (!Number.isInteger(dailyWords) || dailyWords < 1 || dailyWords > 200) {
      toast("Mục tiêu phải từ 1 đến 200 từ mỗi ngày.");
      return;
    }
    setSavingGoal(true);
    try {
      const res = await fetch("/api/goals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dailyWords }),
      });
      if (!res.ok) throw new Error("save failed");
      setGoal(await res.json());
      toast("Đã cập nhật mục tiêu học hằng ngày.");
    } catch {
      toast("Không thể lưu mục tiêu. Vui lòng thử lại.");
    } finally {
      setSavingGoal(false);
    }
  }

  const filteredSets = useMemo(() => {
    if (!sets) return [];
    const query = searchQuery.trim().toLocaleLowerCase("vi");
    return query ? sets.filter((set) => set.name.toLocaleLowerCase("vi").includes(query)) : sets;
  }, [sets, searchQuery]);

  const totalWords = sets?.reduce((sum, set) => sum + set.totalWords, 0) || 0;
  const reviewed = sets?.reduce((sum, set) => sum + set.reviewed, 0) || 0;
  const known = sets?.reduce((sum, set) => sum + set.known, 0) || 0;
  const needsReview = sets?.reduce((sum, set) => sum + set.needsReview, 0) || 0;
  const attemptedSets = sets?.filter((set) => set.accuracy !== null) || [];
  const averageAccuracy = attemptedSets.length
    ? Math.round(attemptedSets.reduce((sum, set) => sum + (set.accuracy || 0), 0) / attemptedSets.length)
    : null;

  return (
    <div className={cx.panel}>
      <h2 className={cx.h2}>Tiến độ của tôi</h2>
      <div className={cx.desc}>Theo dõi mức độ ghi nhớ và kết quả luyện tập của bạn theo từng bộ từ.</div>

      {goal && (
        <section className="my-4 rounded-xl border border-gold/40 bg-gold/5 p-4" aria-labelledby="daily-goal-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 id="daily-goal-title" className="font-semibold">Mục tiêu hôm nay</h3>
              <div className="mt-1 text-sm text-muted">
                <b className={goal.completed ? "text-ok" : "text-ink"}>{goal.todayWords}/{goal.dailyWords} từ</b>
                <span className="mx-2">·</span>
                🔥 {goal.streak} ngày liên tiếp
              </div>
            </div>
            <div className="flex items-end gap-2">
              <label className="text-xs text-muted">
                Số từ/ngày
                <input
                  className={`${cx.input} !mb-0 mt-1 !w-24`}
                  type="number"
                  min={1}
                  max={200}
                  value={goalInput}
                  onChange={(event) => setGoalInput(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") void saveGoal(); }}
                />
              </label>
              <button
                className={`${cx.btn} ${cx.btnGold}`}
                disabled={savingGoal || Number(goalInput) === goal.dailyWords}
                onClick={() => void saveGoal()}
              >
                {savingGoal ? "Đang lưu..." : "Lưu mục tiêu"}
              </button>
            </div>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white" aria-label={`Đã hoàn thành ${Math.min(100, Math.round((goal.todayWords / goal.dailyWords) * 100))}% mục tiêu`}>
            <div className="h-full rounded-full bg-gold transition-[width]" style={{ width: `${Math.min(100, (goal.todayWords / goal.dailyWords) * 100)}%` }} />
          </div>
          <div className={`mt-2 text-xs ${goal.completed ? "font-medium text-ok" : "text-muted"}`}>
            {goal.completed ? "🎉 Bạn đã hoàn thành mục tiêu hôm nay!" : `Còn ${Math.max(0, goal.dailyWords - goal.todayWords)} từ để hoàn thành mục tiêu.`}
          </div>
        </section>
      )}

      {activity && (
        <section className="my-4 rounded-xl border border-line bg-white p-4" aria-labelledby="activity-calendar-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 id="activity-calendar-title" className="font-semibold">Lịch học 30 ngày</h3>
              <div className="mt-1 text-xs text-muted">Mỗi ô thể hiện mức độ hoạt động trong một ngày.</div>
            </div>
            <div className="flex gap-4 text-center text-xs">
              <div><b className="block text-base text-ink">{activity.summary.activeDays}</b><span className="text-muted">ngày hoạt động</span></div>
              <div><b className="block text-base text-ink">{activity.summary.weekWords}</b><span className="text-muted">từ trong 7 ngày</span></div>
              <div><b className="block text-base text-ink">{activity.summary.weekQuizzes}</b><span className="text-muted">bài trong 7 ngày</span></div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-6 gap-1.5 sm:grid-cols-10">
            {activity.days.map((day) => {
              const label = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(new Date(`${day.date}T00:00:00Z`));
              const detail = `${label}: ${day.wordsReviewed} từ, ${day.quizzesCompleted} bài kiểm tra`;
              const tone = day.level === 3 ? "bg-golddark text-white" : day.level === 2 ? "bg-gold/60 text-ink" : day.level === 1 ? "bg-gold/25 text-ink" : "bg-line/50 text-muted";
              return (
                <div
                  key={day.date}
                  className={`flex aspect-square min-h-8 items-center justify-center rounded-md text-[0.68rem] ${tone}`}
                  role="img"
                  aria-label={detail}
                  title={detail}
                >
                  {day.date.slice(-2)}
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-end gap-1 text-[0.68rem] text-muted">
            <span>Ít</span><span className="h-3 w-3 rounded-sm bg-line/50" /><span className="h-3 w-3 rounded-sm bg-gold/25" /><span className="h-3 w-3 rounded-sm bg-gold/60" /><span className="h-3 w-3 rounded-sm bg-golddark" /><span>Nhiều</span>
          </div>
          <div className="mt-3 text-right"><Link className="text-xs font-medium text-golddark hover:underline" href="/weekly-report">Xem báo cáo tuần →</Link></div>
        </section>
      )}

      {achievementSummary && (
        <section className="my-4 rounded-xl border border-line bg-white p-4" aria-labelledby="achievements-title">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 id="achievements-title" className="font-semibold">Huy hiệu thành tích</h3>
              <div className="mt-1 text-xs text-muted">Các cột mốc được cập nhật tự động theo hoạt động học tập.</div>
            </div>
            <span className={cx.badgeGold}>{achievementSummary.unlocked}/{achievementSummary.total} đã mở</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {achievementSummary.achievements.map((achievement) => (
              <article
                key={achievement.id}
                className={`rounded-lg border p-3 ${achievement.unlocked ? "border-gold bg-goldpale/40" : "border-line bg-[#faf9f5]"}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl ${achievement.unlocked ? "bg-goldpale" : "bg-line grayscale opacity-60"}`} aria-hidden="true">
                    {achievement.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold">{achievement.title}</h4>
                      {achievement.unlocked && <span className="text-[0.68rem] font-medium text-ok">✓ Đã mở</span>}
                    </div>
                    <div className="mt-0.5 text-xs text-muted">{achievement.description}</div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
                      <div className={`h-full rounded-full ${achievement.unlocked ? "bg-ok" : "bg-gold"}`} style={{ width: `${achievement.progress}%` }} />
                    </div>
                    <div className="mt-1 text-right text-[0.68rem] text-muted">
                      {Math.min(achievement.current, achievement.target)}/{achievement.target} {achievement.unit}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {sets === null ? (
        <div className={cx.empty} role="status">Đang tổng hợp tiến độ...</div>
      ) : loadError ? (
        <div className={cx.empty}>
          Không thể tải tiến độ.
          <div className="mt-3"><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => void load()}>Thử lại</button></div>
        </div>
      ) : sets.length === 0 ? (
        <div className={cx.empty}>Chưa có bộ từ nào để theo dõi.</div>
      ) : (
        <>
          <div className="my-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <Stat value={`${reviewed}/${totalWords}`} label="Từ đã đánh giá" />
            <Stat value={known} label="Từ đã nhớ" tone="ok" />
            <Stat value={needsReview} label="Từ cần ôn" tone="bad" />
            <Stat value={averageAccuracy === null ? "—" : `${averageAccuracy}%`} label="Điểm trung bình" />
          </div>

          <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
            <input
              type="search"
              className={`${cx.input} !mb-0 max-w-md`}
              placeholder="Tìm bộ từ..."
              aria-label="Tìm trong tiến độ"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <div className="text-[0.8rem] text-muted">{filteredSets.length}/{sets.length} bộ từ</div>
          </div>

          {filteredSets.length === 0 ? (
            <div className={cx.empty}>Không tìm thấy bộ từ phù hợp.</div>
          ) : filteredSets.map((set) => {
            const percent = set.totalWords > 0 ? Math.round((set.reviewed / set.totalWords) * 100) : 0;
            return (
              <div key={set.id} className="mb-3 rounded-[10px] border border-line bg-white p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{set.name}</div>
                    <div className="mt-1 text-[0.78rem] text-muted">
                      {set.known} đã nhớ · {set.needsReview} cần ôn · {set.attempts} lượt kiểm tra
                      {set.accuracy !== null && <> · <b className={set.accuracy >= 70 ? "text-ok" : "text-golddark"}>{set.accuracy}% đúng</b></>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {set.totalWords > 0 ? (
                      <>
                        <Link className={`${cx.btn} ${cx.btnGold} !px-3 !py-1.5`} href={`/learn/${set.id}`}>Học bài</Link>
                        {set.needsReview > 0 && <Link className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} href={`/quiz/${set.id}?mode=fill&retest=1`}>Ôn {set.needsReview} từ</Link>}
                        <Link className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} href={`/quiz/${set.id}?mode=fill`}>Làm bài</Link>
                      </>
                    ) : <span className="text-[0.78rem] text-muted">Chưa có từ</span>}
                  </div>
                </div>
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-[0.72rem] text-muted"><span>Đã đánh giá</span><span>{percent}%</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-gold" style={{ width: `${percent}%` }} /></div>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

function Stat({ value, label, tone }: { value: string | number; label: string; tone?: "ok" | "bad" }) {
  return (
    <div className="rounded-lg border border-line bg-white p-3 text-center">
      <div className={`font-serif text-xl font-bold ${tone === "ok" ? "text-ok" : tone === "bad" ? "text-bad" : ""}`}>{value}</div>
      <div className="text-[0.72rem] text-muted">{label}</div>
    </div>
  );
}
