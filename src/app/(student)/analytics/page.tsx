"use client";

import Link from "next/link";
import ProgressPage from "@/app/(student)/progress/page";

export default function AnalyticsInsightsPage() {
  return (
    <div className="lexora-page-enter space-y-6">
      <header className="lexora-bento relative overflow-hidden p-5 sm:p-7">
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-gold/10 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-gold/25 bg-goldpale px-3 py-1 text-[0.7rem] font-extrabold uppercase tracking-[0.15em] text-golddark">
              <span className="h-1.5 w-1.5 rounded-full bg-gold" />
              Insights &amp; Cognitive Retention
            </div>
            <h1 className="mt-3 font-serif text-[clamp(1.75rem,3.4vw,2.45rem)] font-extrabold tracking-[-0.03em] text-ink">
              Phân tích Trí nhớ &amp; Tiến độ dài hạn
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted">
              Theo dõi biểu đồ hoạt động, độ thành thạo từng kỹ năng (Skill Mastery), lịch sử làm bài và bảng xếp hạng toàn cầu.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href="/weekly-report"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-[13px] border border-line bg-panel px-4 py-2 text-xs font-extrabold text-ink transition hover:-translate-y-0.5 hover:border-gold/40 hover:text-golddark"
            >
              <span>📊</span>
              <span>Báo cáo tuần</span>
            </Link>
            <Link
              href="/history"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-[13px] border border-line bg-panel px-4 py-2 text-xs font-extrabold text-ink transition hover:-translate-y-0.5 hover:border-gold/40 hover:text-golddark"
            >
              <span>◷</span>
              <span>Nhật ký phiên học</span>
            </Link>
            <Link
              href="/leaderboard"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-[13px] bg-gold px-4 py-2 text-xs font-extrabold text-white shadow-[0_10px_22px_-6px_rgb(var(--color-gold)/0.45)] transition hover:-translate-y-0.5 hover:bg-golddark"
            >
              <span>🏆</span>
              <span>Bảng xếp hạng toàn cầu</span>
            </Link>
          </div>
        </div>
      </header>

      <ProgressPage />
    </div>
  );
}
