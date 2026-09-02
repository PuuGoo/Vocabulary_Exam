"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "@/components/Toast";

type Word = { id: number; setId: number; setName: string; setType?: string; meaning?: string; term?: string | null; v1?: string | null; v2?: string | null; v3?: string | null; example?: string | null; reasons: string[] };
type Batch = { setId: number; setName: string; setCategory?: string | null; reviewRound: 1 | 2 | 3 | null; words: Word[] };
type Plan = {
  today: { wordBudget: number; completedWords: number; plannedWords: number; totalDueWords: number; overdueWords: number; dueSetReviews: number; estimatedMinutes: number };
  batches: Batch[]; backlog: { words: number; sets: number }; upcoming: Array<{ date: string; count: number }>;
};

function requestKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function ReviewTodayPage() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState(false);
  const [started, setStarted] = useState(false);
  const [batchIndex, setBatchIndex] = useState(0);
  const [wordIndex, setWordIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [answers, setAnswers] = useState<Array<{ wordId: number; correct: boolean }>>([]);
  const [completedInRun, setCompletedInRun] = useState(0);
  const [saving, setSaving] = useState(false);
  const keyRef = useRef(requestKey());

  async function load(extra = false) {
    setError(false);
    try {
      const response = await fetch(`/api/review/plan${extra ? "?extra=1" : ""}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      setPlan(await response.json()); setBatchIndex(0); setWordIndex(0); setAnswers([]); setRevealed(false); keyRef.current = requestKey();
    } catch { setError(true); }
  }
  useEffect(() => { void load(); }, []);

  const batch = plan?.batches[batchIndex];
  const word = batch?.words[wordIndex];
  const totalRun = plan?.today.plannedWords || 0;
  const done = Boolean(started && plan && batchIndex >= plan.batches.length);
  const title = word?.setType === "irregular_verb" ? word.v1 : word?.term;
  const detail = word?.setType === "irregular_verb" ? [word.v2, word.v3, word.meaning].filter(Boolean).join(" · ") : word?.meaning;
  const progress = totalRun ? Math.min(100, (completedInRun / totalRun) * 100) : 100;
  const topics = useMemo(() => new Set(plan?.batches.map((item) => item.setId)).size, [plan]);

  async function answer(correct: boolean) {
    if (!batch || !word || saving) return;
    const nextAnswers = [...answers, { wordId: word.id, correct }];
    if (wordIndex < batch.words.length - 1) {
      setAnswers(nextAnswers); setWordIndex((value) => value + 1); setRevealed(false); setCompletedInRun((value) => value + 1); return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/review/plan", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: keyRef.current, setId: batch.setId, expectedStage: batch.reviewRound, outcomes: nextAnswers }),
      });
      if (!response.ok) throw new Error();
      setCompletedInRun((value) => value + 1); setBatchIndex((value) => value + 1); setWordIndex(0); setAnswers([]); setRevealed(false); keyRef.current = requestKey();
      toast(`${batch.setName} hoàn thành`);
    } catch { toast("Chưa thể lưu mini-session. Hãy thử lại."); } finally { setSaving(false); }
  }

  if (!plan && !error) return <div className="lexora-card p-6 text-sm text-muted" role="status">Đang sắp xếp những từ quan trọng nhất…</div>;
  if (error || !plan) return <div className="lexora-card p-6 text-center"><h1 className="font-extrabold">Không thể tải kế hoạch ôn</h1><button className="mt-4 min-h-11 rounded-xl bg-[#6550DB] px-5 font-bold text-white" onClick={() => void load()}>Thử lại</button></div>;

  if (done) return <div className="mx-auto max-w-xl space-y-5 text-center">
    <section className="lexora-card p-7 sm:p-10"><div className="text-4xl">🎉</div><h1 className="mt-3 text-2xl font-extrabold">Hoàn thành kế hoạch hôm nay</h1><p className="mt-2 text-muted">{completedInRun}/{totalRun} từ</p></section>
    {plan.backlog.words > 0 ? <section className="lexora-card p-6"><b>Còn {plan.backlog.words} từ đến hạn</b><p className="mt-2 text-sm leading-6 text-muted">Bạn có một số bài ôn đang chờ. Lexora sẽ ưu tiên những từ quan trọng nhất trước.</p><button className="mt-5 min-h-12 w-full rounded-xl bg-[#6550DB] px-5 font-extrabold text-white" onClick={() => { setStarted(false); setCompletedInRun(0); void load(true); }}>Ôn thêm</button></section> : <Link href="/study" className="inline-flex min-h-12 items-center rounded-xl bg-[#6550DB] px-6 font-bold text-white">Học bài mới</Link>}
  </div>;

  if (started && batch && word) return <div className="mx-auto flex min-h-[calc(100dvh-9rem)] max-w-xl flex-col">
    <header className="mb-4"><div className="flex items-center justify-between text-xs font-bold text-muted"><span>Ôn tập hôm nay</span><span>{completedInRun + 1} / {totalRun} từ</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[#ECEAF5]"><div className="h-full rounded-full bg-[#6550DB] transition-[width]" style={{ width: `${progress}%` }} /></div><div className="mt-4"><b className="text-sm">{batch.setName}</b>{batch.reviewRound ? <span className="ml-2 text-xs font-semibold text-[#D87855]">Ôn lần {batch.reviewRound}/3</span> : null}</div></header>
    <button type="button" onClick={() => setRevealed(true)} className="lexora-card flex min-h-72 flex-1 flex-col items-center justify-center p-7 text-center focus-visible:ring-2 focus-visible:ring-[#6550DB]">
      <p className="text-xs font-bold uppercase tracking-[.14em] text-muted">{revealed ? "Đáp án" : "Bạn còn nhớ?"}</p>
      <h1 className="mt-5 break-words text-3xl font-extrabold">{revealed ? detail : title}</h1>
      {revealed && word.example ? <p className="mt-5 text-sm italic leading-6 text-muted">{word.example}</p> : null}
      {!revealed ? <span className="mt-8 text-sm font-bold text-[#6550DB]">Chạm để xem đáp án</span> : null}
    </button>
    <div className="mt-4 grid grid-cols-2 gap-3 pb-[max(8px,env(safe-area-inset-bottom))]">
      <button disabled={!revealed || saving} onClick={() => void answer(false)} className="min-h-14 rounded-xl border border-[#F0CACA] bg-[#FFF3F3] font-extrabold text-[#A94747] disabled:opacity-40">Chưa nhớ</button>
      <button disabled={!revealed || saving} onClick={() => void answer(true)} className="min-h-14 rounded-xl bg-[#398B73] font-extrabold text-white disabled:opacity-40">Đã nhớ</button>
    </div>
  </div>;

  return <div className="mx-auto max-w-2xl space-y-5">
    <section><p className="mb-2 text-sm font-semibold text-gold">Kế hoạch tự động</p><h1 className="text-3xl font-extrabold tracking-[-.04em]">Ôn tập hôm nay</h1></section>
    {plan.today.plannedWords === 0 ? <section className="lexora-card p-7 text-center"><div className="text-3xl">✓</div><h2 className="mt-3 text-xl font-extrabold">Bạn đã hoàn thành phần ôn hôm nay</h2>{plan.backlog.words > 0 ? <><p className="mt-2 text-sm text-muted">Còn {plan.backlog.words} từ đến hạn trong backlog.</p><button className="mt-5 min-h-12 rounded-xl bg-[#6550DB] px-6 font-bold text-white" onClick={() => void load(true)}>Ôn thêm</button></> : <Link href="/study" className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-[#6550DB] px-6 font-bold text-white">Học bài mới</Link>}</section> : <>
      <section className="rounded-[20px] bg-[#302A68] p-6 text-white"><div className="grid grid-cols-3 gap-3 text-center"><div><strong className="text-2xl">{plan.today.plannedWords}</strong><span className="mt-1 block text-xs text-[#D3D0EC]">từ</span></div><div><strong className="text-2xl">{topics}</strong><span className="mt-1 block text-xs text-[#D3D0EC]">chủ đề</span></div><div><strong className="text-2xl">~{plan.today.estimatedMinutes}</strong><span className="mt-1 block text-xs text-[#D3D0EC]">phút</span></div></div><button className="mt-6 min-h-12 w-full rounded-xl bg-white font-extrabold text-[#302A68]" onClick={() => setStarted(true)}>Bắt đầu</button></section>
      <section className="lexora-card p-5"><h2 className="font-extrabold">Kế hoạch</h2><ol className="mt-4 space-y-3">{plan.batches.map((item, index) => <li key={item.setId} className="flex items-center gap-3 rounded-xl bg-[#F8F7FC] p-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#EFECFF] text-xs font-bold text-[#6550DB]">{index + 1}</span><span className="min-w-0 flex-1"><b className="block truncate text-sm">{item.setName}</b>{item.reviewRound ? <small className="text-muted">Ôn lần {item.reviewRound}/3</small> : <small className="text-muted">Từ cần ôn</small>}</span><b className="text-sm">{item.words.length} từ</b></li>)}</ol></section>
      {plan.backlog.words > 0 ? <section className="rounded-xl border border-[#E7E3F6] bg-[#FAF9FE] p-4 text-sm"><b>Backlog: {plan.backlog.words} từ</b><p className="mt-1 leading-6 text-muted">Lexora sẽ ưu tiên những từ quan trọng nhất trước. Bạn không cần hoàn thành tất cả trong một ngày.</p></section> : null}
      <section className="lexora-card p-5"><h2 className="font-extrabold">7 ngày tới</h2><div className="mt-4 space-y-2">{plan.upcoming.map((item, index) => <div key={item.date} className="flex items-center justify-between rounded-lg px-2 py-2 text-sm"><span className="text-muted">{index === 0 ? "Hôm nay" : index === 1 ? "Ngày mai" : new Intl.DateTimeFormat("vi-VN", { weekday: "long" }).format(new Date(`${item.date}T12:00:00`))}</span><b>{item.count}</b></div>)}</div></section>
    </>}
  </div>;
}
