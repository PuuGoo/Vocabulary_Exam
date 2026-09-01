"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type DashboardData = { displayName: string; goal: { dailyWords: number; todayWords: number; streak: number } | null; due: number | null; assignments: number | null; session: { setId: number; position: number } | null };

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>({ displayName: "", goal: null, due: null, assignments: null, session: null });
  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/auth/me").then((r) => r.ok ? r.json() : null), fetch("/api/goals").then((r) => r.ok ? r.json() : null),
      fetch("/api/smart-review?limit=1").then((r) => r.ok ? r.json() : null), fetch("/api/assignments").then((r) => r.ok ? r.json() : null),
      fetch("/api/study-sessions").then((r) => r.ok ? r.json() : null),
    ]).then(([me, goal, review, assignmentData, sessionData]) => {
      if (!active) return;
      const assignments = Array.isArray(assignmentData?.assignments) ? assignmentData.assignments : null;
      setData({ displayName: me?.session?.displayName || me?.session?.username || "bạn", goal, due: typeof review?.summary?.due === "number" ? review.summary.due : null, assignments: assignments ? assignments.filter((item: { status?: string }) => item.status !== "completed").length : null, session: Array.isArray(sessionData?.sessions) ? sessionData.sessions[0] || null : null });
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const continueHref = data.session ? `/learn/${data.session.setId}?position=${data.session.position}` : "/study";
  return <div className="lexora-page-enter space-y-6">
    <section><p className="mb-2 text-sm font-semibold text-gold">Tổng quan</p><h1 className="text-[clamp(1.8rem,4vw,2.55rem)] font-extrabold tracking-[-0.045em]">Chào {data.displayName || "bạn"}</h1><p className="mt-2 max-w-xl text-[0.95rem] leading-6 text-muted">Chọn việc cần làm tiếp theo và duy trì nhịp học của bạn.</p></section>
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,.75fr)]">
      <article className="rounded-[20px] bg-[#302A68] p-6 text-white shadow-[0_12px_30px_rgba(48,42,104,0.18)] sm:p-8"><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#C8C2FF]">Tiếp tục học</p><h2 className="mt-3 text-2xl font-extrabold">{data.session ? "Tiếp tục phiên học gần nhất" : "Bắt đầu một phiên học"}</h2><p className="mt-2 max-w-lg text-sm leading-6 text-[#D3D0EC]">{data.session ? "Tiến trình gần nhất của bạn đã được lưu." : "Chọn một bộ từ và chế độ phù hợp với mục tiêu hôm nay."}</p><Link href={continueHref} className="mt-6 inline-flex rounded-[11px] bg-white px-4 py-2.5 text-sm font-bold text-[#302A68] hover:bg-[#F5F3FF]">{data.session ? "Tiếp tục học" : "Bắt đầu học"} →</Link></article>
      <article className="lexora-card p-5 sm:p-6"><h2 className="text-base font-extrabold">Mục tiêu hôm nay</h2>{data.goal ? <><div className="mt-5 flex items-end justify-between"><strong className="text-3xl">{data.goal.todayWords}/{data.goal.dailyWords}</strong><span className="text-xs font-semibold text-muted">từ đã học</span></div><div className="mt-3 h-2 rounded-full bg-[#F0EEF7]"><div className="h-full rounded-full bg-gold" style={{ width: `${Math.min(100, (data.goal.todayWords / Math.max(1, data.goal.dailyWords)) * 100)}%` }} /></div><p className="mt-4 text-xs text-muted">Chuỗi hiện tại: <b className="text-ink">{data.goal.streak} ngày</b></p></> : <p className="mt-4 text-sm text-muted">Chưa tải được dữ liệu mục tiêu.</p>}</article>
    </section>
    <section className="grid gap-4 sm:grid-cols-2">
      <Link href="/smart-review" className="lexora-card p-5 transition hover:-translate-y-0.5 hover:border-[#D8D2FF]"><p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Cần ôn</p><strong className="mt-3 block text-2xl">{data.due ?? "—"}</strong><span className="mt-2 block text-sm text-muted">{data.due === 0 ? "Hiện chưa có từ đến hạn ôn." : "Mở Smart Review để ôn đúng lúc."}</span></Link>
      <Link href="/assignments" className="lexora-card p-5 transition hover:-translate-y-0.5 hover:border-[#D8D2FF]"><p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Bài tập</p><strong className="mt-3 block text-2xl">{data.assignments ?? "—"}</strong><span className="mt-2 block text-sm text-muted">{data.assignments === 0 ? "Chưa có bài tập nào đang chờ." : "Xem các bài tập được giao."}</span></Link>
    </section>
  </div>;
}
