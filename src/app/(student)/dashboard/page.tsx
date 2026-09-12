"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type ReviewPlan = { today: { wordBudget: number; completedWords: number; plannedWords: number; overdueWords: number; dueSetReviews: number; estimatedMinutes: number }; backlog: { words: number } };
type DashboardData = { displayName: string; review: ReviewPlan | null; assignments: number | null; session: { setId: number; position: number } | null };

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>({ displayName: "", review: null, assignments: null, session: null });
  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/auth/me").then((r) => r.ok ? r.json() : null),
      fetch("/api/review/plan").then((r) => r.ok ? r.json() : null),
      fetch("/api/assignments").then((r) => r.ok ? r.json() : null),
      fetch("/api/study-sessions").then((r) => r.ok ? r.json() : null),
    ]).then(([me, review, assignmentData, sessionData]) => {
      if (!active) return;
      const assignments = Array.isArray(assignmentData?.assignments) ? assignmentData.assignments : null;
      setData({ displayName: me?.session?.displayName || me?.session?.username || "bạn", review, assignments: assignments ? assignments.filter((item: { status?: string }) => item.status !== "completed").length : null, session: Array.isArray(sessionData?.sessions) ? sessionData.sessions[0] || null : null });
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const continueHref = data.session ? `/learn/${data.session.setId}?position=${data.session.position}` : "/study";
  const review = data.review;
  const reviewTarget = review ? Math.min(review.today.wordBudget, review.today.completedWords + review.today.plannedWords) : 0;
  return <div className="lexora-page-enter space-y-6">
    <section><p className="mb-2 text-sm font-semibold text-gold">Tổng quan</p><h1 className="text-[clamp(1.8rem,4vw,2.55rem)] font-extrabold tracking-[-0.045em]">Chào {data.displayName || "bạn"}</h1><p className="mt-2 max-w-xl text-[0.95rem] leading-6 text-muted">Lexora đã sắp xếp phần ôn quan trọng nhất cho bạn.</p></section>
    <section className="rounded-[20px] bg-[#302A68] p-6 text-white shadow-[0_12px_30px_rgba(48,42,104,0.18)] sm:p-8">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#C8C2FF]">Ôn tập hôm nay</p>
      {!review ? <p className="mt-4 text-sm text-[#D3D0EC]">Đang tổng hợp kế hoạch…</p> : review.today.plannedWords === 0 ? <><h2 className="mt-3 text-2xl font-extrabold">✓ Bạn đã hoàn thành phần ôn hôm nay</h2><Link href="/study" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-white px-5 font-bold text-[#302A68]">Học bài mới</Link></> : <>
        <h2 className="mt-3 text-2xl font-extrabold">{Math.min(reviewTarget, review.today.completedWords)}/{reviewTarget} từ trong kế hoạch</h2><p className="mt-2 text-sm text-[#D3D0EC]">Còn {review.today.plannedWords} từ ưu tiên trong lượt hôm nay.</p>
        <div className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><span><b className="block text-xl">{review.today.overdueWords}</b><small className="text-[#D3D0EC]">từ quá hạn</small></span><span><b className="block text-xl">{review.today.dueSetReviews}</b><small className="text-[#D3D0EC]">bài cần củng cố</small></span><span><b className="block text-xl">~{review.today.estimatedMinutes}</b><small className="text-[#D3D0EC]">phút</small></span><span><b className="block text-xl">{review.backlog.words}</b><small className="text-[#D3D0EC]">từ backlog</small></span></div>
        <Link href="/review-today" className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-white px-5 font-extrabold text-[#302A68] sm:w-auto">Bắt đầu ôn hôm nay →</Link>
      </>}
    </section>
    <section className="grid gap-4 sm:grid-cols-2">
      <Link href={continueHref} className="lexora-card p-5 transition hover:-translate-y-0.5 hover:border-[#D8D2FF]"><p className="text-xs font-bold uppercase tracking-[.12em] text-muted">Tiếp tục học</p><h2 className="mt-3 font-extrabold">{data.session ? "Tiếp tục phiên gần nhất" : "Học một bộ từ mới"}</h2><span className="mt-3 block text-sm text-gold">Mở học →</span></Link>
      <Link href="/assignments" className="lexora-card p-5 transition hover:-translate-y-0.5 hover:border-[#D8D2FF]"><p className="text-xs font-bold uppercase tracking-[.12em] text-muted">Bài tập</p><strong className="mt-3 block text-2xl">{data.assignments ?? "—"}</strong><span className="mt-2 block text-sm text-muted">{data.assignments === 0 ? "Chưa có bài tập nào đang chờ." : "Xem các bài tập được giao."}</span></Link>
    </section>
  </div>;
}
