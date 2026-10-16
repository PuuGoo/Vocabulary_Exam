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

  return (
    <div className="lexora-page-enter space-y-6">
      <StudyPlannerCard />

      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-sm font-semibold text-gold">Today · Smart SRS Queue</p>
          <h1 className="text-[clamp(1.8rem,4vw,2.55rem)] font-extrabold tracking-[-0.045em] lexora-gradient-text">
            Chào {data.displayName || "bạn"}
          </h1>
          <p className="mt-2 max-w-xl text-[0.95rem] leading-6 text-muted">
            Hàng đợi Smart SRS tự động tính toán từ cần ôn trong ngày theo đường cong quên lãng.
          </p>
        </div>
        {data.goal && (
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 shadow-xs">
            <span className="text-xl" aria-hidden="true">🔥</span>
            <div>
              <b className="block text-sm font-extrabold">{data.goal.streak} ngày liên tiếp</b>
              <span className="text-xs text-muted">
                Hôm nay: {data.goal.todayWords}/{data.goal.dailyWords} từ
              </span>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-[22px] bg-[#302A68] p-6 text-white shadow-[0_12px_30px_rgba(48,42,104,0.18)] sm:p-8 [background:linear-gradient(145deg,#302A68_0%,#261f5c_50%,#302A68_100%)] lexora-glow-border">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#C8C2FF]">
          Smart SRS Review · Hôm nay
        </p>
        {!review ? (
          <p className="mt-4 text-sm text-[#D3D0EC]">Đang tổng hợp kế hoạch…</p>
        ) : review.today.plannedWords === 0 ? (
          <>
            <h2 className="mt-3 text-2xl font-extrabold">✓ Bạn đã hoàn thành phần ôn hôm nay</h2>
            <Link
              href="/study"
              className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-white px-5 font-bold text-[#302A68]"
            >
              Bắt đầu phiên học 4 bước →
            </Link>
          </>
        ) : (
          <>
            <h2 className="mt-3 text-2xl font-extrabold">
              {Math.min(reviewTarget, review.today.completedWords)}/{reviewTarget} từ trong kế hoạch
            </h2>
            <p className="mt-2 text-sm text-[#D3D0EC]">
              Còn {review.today.plannedWords} từ ưu tiên trong lượt hôm nay.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-4 text-[0.82rem] sm:grid-cols-4">
              <span>
                <b className="block text-xl">{review.today.overdueWords}</b>
                <small className="text-[#D3D0EC]">từ quá hạn</small>
              </span>
              <span>
                <b className="block text-xl">{review.today.dueSetReviews}</b>
                <small className="text-[#D3D0EC]">bài cần củng cố</small>
              </span>
              <span>
                <b className="block text-xl">~{review.today.estimatedMinutes}</b>
                <small className="text-[#D3D0EC]">phút</small>
              </span>
              <span>
                <b className="block text-xl">{review.backlog.words}</b>
                <small className="text-[#D3D0EC]">từ backlog</small>
              </span>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/review-today"
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-white px-5 font-extrabold text-[#302A68] sm:w-auto"
              >
                Bắt đầu ôn tập SRS hôm nay →
              </Link>
              <Link
                href="/smart-review"
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-white/25 bg-white/10 px-4 text-sm font-bold text-white hover:bg-white/20 sm:w-auto"
              >
                Smart Review nâng cao
              </Link>
            </div>
          </>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Link
          href={continueHref}
          className="lexora-card lexora-hover-lift block rounded-[22px] border border-line bg-white p-5"
        >
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-gold">Study · 4 cấp độ nhận thức</span>
          <h3 className="mt-2 text-lg font-extrabold">
            {data.session ? "Tiếp tục bài đang dở" : "Khởi động phiên học mới"}
          </h3>
          <p className="mt-1 text-sm text-muted">
            Recall → Context Cloze → Audio/Tone → Feynman Mastery AI.
          </p>
        </Link>
        <Link
          href="/daily-challenge"
          className="lexora-card lexora-hover-lift block rounded-[22px] border border-line bg-white p-5"
        >
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-gold">Thử thách mỗi ngày</span>
          <h3 className="mt-2 text-lg font-extrabold">Daily Challenge</h3>
          <p className="mt-1 text-sm text-muted">
            Kiểm tra phản xạ nhanh và giữ vững chuỗi streak cá nhân.
          </p>
        </Link>
        <Link
          href="/library"
          className="lexora-card lexora-hover-lift block rounded-[22px] border border-line bg-white p-5"
        >
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-gold">Library & Decks</span>
          <h3 className="mt-2 text-lg font-extrabold">Kho từ & Sổ tay cá nhân</h3>
          <p className="mt-1 text-sm text-muted">
            Bộ thẻ IELTS/HSK/SAT, Sổ tay từ đã lưu và kho từ cần khắc phục.
          </p>
        </Link>
      </section>
    </div>
  );
}
