"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import StudyPlannerCard from "@/components/StudyPlannerCard";

type ReviewPlan = {
  today: {
    wordBudget: number;
    completedWords: number;
    plannedWords: number;
    overdueWords: number;
    dueSetReviews: number;
    estimatedMinutes: number;
  };
  backlog: { words: number };
};
type GoalSummary = {
  dailyWords: number;
  todayWords: number;
  streak: number;
  completed: boolean;
};
type DashboardData = {
  displayName: string;
  review: ReviewPlan | null;
  goal: GoalSummary | null;
  session: { setId: number; position: number } | null;
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>({
    displayName: "",
    review: null,
    goal: null,
    session: null,
  });

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/review/plan").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/goals").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/study-sessions").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([me, review, goal, sessionData]) => {
        if (!active) return;
        setData({
          displayName: me?.session?.displayName || me?.session?.username || "bạn",
          review,
          goal,
          session: Array.isArray(sessionData?.sessions) ? sessionData.sessions[0] || null : null,
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const continueHref = data.session
    ? `/study/${data.session.setId}?position=${data.session.position}`
    : "/study";
  const review = data.review;
  const reviewTarget = review
    ? Math.min(review.today.wordBudget, review.today.completedWords + review.today.plannedWords)
    : 0;
  const reviewCompleted = review ? Math.min(reviewTarget, review.today.completedWords) : 0;
  const reviewPct = reviewTarget > 0 ? Math.min(100, Math.round((reviewCompleted / reviewTarget) * 100)) : 0;

  return (
    <div className="lexora-page-enter space-y-6">
      {/* Top Greeting + Daily Streak Ribbon */}
      <section className="lexora-bento relative overflow-hidden p-5 sm:p-7">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-gold/10 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-gold/25 bg-goldpale px-3 py-1 text-[0.7rem] font-extrabold uppercase tracking-[0.15em] text-golddark">
              <span className="h-1.5 w-1.5 rounded-full bg-gold" />
              Today · Smart FSRS Command Center
            </div>
            <h1 className="mt-3 font-serif text-[clamp(1.85rem,3.6vw,2.65rem)] font-extrabold tracking-[-0.035em] text-ink">
              Chào {data.displayName || "bạn"},{" "}
              <span className="lexora-gradient-text">sẵn sàng bứt phá hôm nay?</span>
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted">
              Hàng đợi Smart SRS đã tự động phân loại các từ vựng đến điểm rơi quên lãng để bạn ôn tập hiệu quả nhất.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {data.goal && (
              <div className="flex items-center gap-3.5 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-xl" aria-hidden="true">
                  🔥
                </span>
                <div>
                  <b className="block font-serif text-base font-extrabold text-ink">
                    {data.goal.streak} ngày chuỗi học
                  </b>
                  <span className="text-xs font-semibold text-muted">
                    Mục tiêu ngày: {data.goal.todayWords}/{data.goal.dailyWords} từ
                  </span>
                </div>
              </div>
            )}
            <Link
              href={continueHref}
              className="inline-flex min-h-11 items-center gap-2 rounded-[14px] bg-gold px-4 py-2.5 text-xs font-extrabold text-white shadow-[0_10px_24px_-6px_rgb(var(--color-gold)/0.45)] transition hover:-translate-y-0.5 hover:bg-golddark"
            >
              <span>🎯</span>
              <span>{data.session ? "Tiếp tục phiên học" : "Học bộ từ mới"}</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Hero Smart SRS Queue + Study Planner Bento */}
      <div className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
        <section className="lexora-hero-mesh relative flex flex-col justify-between overflow-hidden rounded-[24px] p-6 text-white shadow-[0_18px_45px_-12px_rgba(30,27,75,0.35)] sm:p-8">
          <div
            className="pointer-events-none absolute -right-20 -bottom-20 h-72 w-72 rounded-full bg-indigo-400/20 blur-3xl"
            aria-hidden="true"
          />
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[0.7rem] font-extrabold uppercase tracking-[0.14em] text-indigo-100 backdrop-blur-xs">
                ⚡ Smart SRS Review Queue
              </span>
              {review && reviewTarget > 0 && (
                <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-extrabold text-white">
                  Hoàn thành {reviewPct}%
                </span>
              )}
            </div>

            {!review ? (
              <div className="mt-6 space-y-3">
                <div className="h-7 w-56 animate-pulse rounded-xl bg-white/15" />
                <div className="h-4 w-72 animate-pulse rounded-lg bg-white/10" />
              </div>
            ) : review.today.plannedWords === 0 ? (
              <div className="mt-6">
                <h2 className="font-serif text-2xl font-extrabold sm:text-3xl">
                  ✓ Bạn đã hoàn tất toàn bộ hàng đợi SRS hôm nay!
                </h2>
                <p className="mt-2 max-w-lg text-sm leading-6 text-indigo-100/85">
                  Trí nhớ dài hạn của bạn đang ở trạng thái tối ưu. Bạn có thể mở khóa bộ từ mới hoặc thử sức với Feynman AI.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    href="/study"
                    className="inline-flex min-h-12 items-center justify-center rounded-[14px] bg-white px-5 text-sm font-extrabold text-indigo-950 shadow-lg transition hover:-translate-y-0.5"
                  >
                    Khám phá bộ từ mới →
                  </Link>
                  <Link
                    href="/daily-challenge"
                    className="inline-flex min-h-12 items-center justify-center rounded-[14px] border border-white/25 bg-white/10 px-4 text-sm font-bold text-white transition hover:bg-white/20"
                  >
                    ✦ Thử thách hôm nay
                  </Link>
                </div>
              </div>
            ) : (
              <div className="mt-5">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 className="font-serif text-2xl font-extrabold sm:text-3xl">
                    {reviewCompleted}/{reviewTarget} từ trong kế hoạch hôm nay
                  </h2>
                  <span className="text-xs font-bold text-indigo-200">
                    Còn {review.today.plannedWords} từ cần củng cố
                  </span>
                </div>

                <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-300 to-emerald-300 transition-all duration-500"
                    style={{ width: `${reviewPct}%` }}
                  />
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-2xl border border-white/12 bg-white/8 p-3.5 backdrop-blur-xs">
                    <b className="block font-serif text-2xl font-extrabold text-white">
                      {review.today.overdueWords}
                    </b>
                    <span className="text-xs font-medium text-indigo-100/80">Từ quá hạn</span>
                  </div>
                  <div className="rounded-2xl border border-white/12 bg-white/8 p-3.5 backdrop-blur-xs">
                    <b className="block font-serif text-2xl font-extrabold text-white">
                      {review.today.dueSetReviews}
                    </b>
                    <span className="text-xs font-medium text-indigo-100/80">Bộ cần ôn</span>
                  </div>
                  <div className="rounded-2xl border border-white/12 bg-white/8 p-3.5 backdrop-blur-xs">
                    <b className="block font-serif text-2xl font-extrabold text-white">
                      ~{review.today.estimatedMinutes}p
                    </b>
                    <span className="text-xs font-medium text-indigo-100/80">Thời lượng</span>
                  </div>
                  <div className="rounded-2xl border border-white/12 bg-white/8 p-3.5 backdrop-blur-xs">
                    <b className="block font-serif text-2xl font-extrabold text-white">
                      {review.backlog.words}
                    </b>
                    <span className="text-xs font-medium text-indigo-100/80">Tồn đọng</span>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    href="/study?smart=1"
                    className="inline-flex min-h-12 items-center justify-center rounded-[14px] bg-white px-6 text-sm font-extrabold text-indigo-950 shadow-lg transition hover:-translate-y-0.5"
                  >
                    Bắt đầu ôn Smart SRS ngay →
                  </Link>
                  <Link
                    href={continueHref}
                    className="inline-flex min-h-12 items-center justify-center rounded-[14px] border border-white/25 bg-white/10 px-4 text-sm font-bold text-white transition hover:bg-white/20"
                  >
                    {data.session ? "Tiếp tục bộ đang học" : "Chọn bộ từ thủ công"}
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* 4-Stage Recall Pipeline strip inside Hero */}
          <div className="mt-7 border-t border-white/12 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-indigo-100/85">
              <span className="font-bold uppercase tracking-wider text-indigo-200">
                Chu trình 4 bước nhận thức:
              </span>
              <div className="flex flex-wrap items-center gap-2 font-semibold">
                <span className="rounded-lg bg-white/10 px-2.5 py-1">1. Flashcard</span>
                <span>→</span>
                <span className="rounded-lg bg-white/10 px-2.5 py-1">2. Cloze</span>
                <span>→</span>
                <span className="rounded-lg bg-white/10 px-2.5 py-1">3. Dictation</span>
                <span>→</span>
                <span className="rounded-lg bg-amber-400/20 px-2.5 py-1 text-amber-200">4. Feynman AI</span>
              </div>
            </div>
          </div>
        </section>

        {/* Quick Launch Bento Cards */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <Link
            href={continueHref}
            className="lexora-bento group flex flex-col justify-between p-6"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-goldpale text-lg text-golddark">
                  📚
                </span>
                <span className="rounded-full bg-goldpale px-2.5 py-1 text-[0.68rem] font-extrabold uppercase tracking-wider text-golddark">
                  {data.session ? "Đang học dở" : "Sẵn sàng"}
                </span>
              </div>
              <h3 className="mt-4 font-serif text-lg font-extrabold text-ink group-hover:text-golddark">
                {data.session ? "Tiếp tục phiên học gần nhất" : "Học bộ từ vựng mới"}
              </h3>
              <p className="mt-1.5 text-xs leading-5 text-muted">
                {data.session
                  ? `Quay lại bộ #${data.session.setId} tại thẻ số ${data.session.position + 1} để hoàn thành chu trình nhớ.`
                  : "Mở bộ từ IELTS hoặc HSK theo chủ đề và bắt đầu 4 bước ghi nhớ sâu."}
              </p>
            </div>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-extrabold text-golddark">
              Vào học ngay <span className="transition-transform group-hover:translate-x-1">→</span>
            </span>
          </Link>

          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/daily-challenge"
              className="lexora-bento group flex flex-col justify-between p-4"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/12 text-base">
                ⚡
              </span>
              <div className="mt-3">
                <b className="block font-serif text-sm font-extrabold text-ink group-hover:text-golddark">
                  Thử thách ngày
                </b>
                <span className="mt-0.5 block text-[0.72rem] text-muted">
                  Quiz tốc độ &amp; bảng xếp hạng
                </span>
              </div>
            </Link>
            <Link
              href="/exam"
              className="lexora-bento group flex flex-col justify-between p-4"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/12 text-base">
                📝
              </span>
              <div className="mt-3">
                <b className="block font-serif text-sm font-extrabold text-ink group-hover:text-golddark">
                  Phòng thi thử
                </b>
                <span className="mt-0.5 block text-[0.72rem] text-muted">
                  Kiểm tra áp lực thời gian
                </span>
              </div>
            </Link>
          </div>
        </section>
      </div>

      {/* Study Planner Journal (Task Journal) */}
      <StudyPlannerCard />
    </div>
  );
}
