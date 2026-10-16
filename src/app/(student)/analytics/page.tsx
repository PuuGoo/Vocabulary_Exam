"use client";

import Link from "next/link";
import ProgressPage from "@/app/(student)/progress/page";

export default function AnalyticsInsightsPage() {
  return (
    <div className="space-y-6">
      <header className="lexora-surface flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5">
        <div>
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-gold">
            Insights &amp; Long-Term Memory
          </span>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
            Phân tích Tiến độ &amp; Độ thành thạo
          </h1>
          <p className="mt-1 text-xs text-muted">
            Tổng hợp biểu đồ ghi nhớ dài hạn, lịch sử phiên học, báo cáo tuần và bảng xếp hạng chuỗi ngày học toàn cầu.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/weekly-report"
            className="rounded-xl border border-line bg-white px-3.5 py-2 text-xs font-bold text-ink transition hover:border-gold/40"
          >
            📊 Báo cáo tuần
          </Link>
          <Link
            href="/leaderboard"
            className="rounded-xl bg-gold px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:opacity-95"
          >
            🏆 Bảng xếp hạng toàn cầu
          </Link>
        </div>
      </header>

      <ProgressPage />
    </div>
  );
}
