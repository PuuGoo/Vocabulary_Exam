"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import SpeakButton from "@/components/SpeakButton";
import { toast } from "@/components/Toast";
import { cx } from "@/components/ui";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";
import { useSwipeNavigation } from "@/hooks/useSwipeNavigation";

type Question = { id: number; setId: number; setName: string; meaning: string; ipa: string | null; choices: string[] };
type Completion = { score: number; total: number; createdAt?: string };
type Correction = { wordId: number; answer: string; correctAnswer: string; correct: boolean; example: string | null };

function timeUntilTomorrow() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setHours(24, 0, 0, 0);
  const seconds = Math.max(0, Math.floor((tomorrow.getTime() - now.getTime()) / 1000));
  return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function DailyChallengePage() {
  const [date, setDate] = useState("");
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [completion, setCompletion] = useState<Completion | null>(null);
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [corrections, setCorrections] = useState<Correction[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [countdown, setCountdown] = useState(timeUntilTomorrow());
  const nextButtonRef = useRef<HTMLButtonElement>(null);

  useUnsavedChangesWarning(started && !completion && Object.keys(answers).length > 0, "Thử thách hôm nay chưa được nộp. Bạn vẫn muốn rời trang?");

  useEffect(() => {
    let active = true;
    setQuestions(null);
    setLoadError(false);
    fetch("/api/daily-challenge")
      .then(async (res) => { if (!res.ok) throw new Error("load failed"); return res.json(); })
      .then((data) => { if (active) { setDate(data.date); setQuestions(data.challenge || []); setCompletion(data.completed); } })
      .catch(() => { if (active) { setQuestions([]); setLoadError(true); } });
    return () => { active = false; };
  }, [loadAttempt]);

  useEffect(() => {
    const timer = window.setInterval(() => setCountdown(timeUntilTomorrow()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const question = questions?.[index];
  const answeredCount = Object.keys(answers).length;
  const allAnswered = !!questions && answeredCount === questions.length;
  const score = completion?.score ?? corrections?.filter((item) => item.correct).length ?? 0;
  const correctionByWord = useMemo(() => new Map((corrections || []).map((item) => [item.wordId, item])), [corrections]);

  function selectAnswer(value: string) {
    if (!question || corrections) return;
    setAnswers((current) => ({ ...current, [question.id]: value }));
    window.setTimeout(() => nextButtonRef.current?.focus(), 0);
  }

  function goNext() {
    if (!questions || !answers[question?.id || 0]) return;
    setIndex((current) => Math.min(questions.length - 1, current + 1));
  }

  async function submit() {
    if (!questions || !allAnswered || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/daily-challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: questions.map((item) => ({ wordId: item.id, answer: answers[item.id] })) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 409 && data?.completed) { setCompletion(data.completed); return; }
        throw new Error(data?.error || "Không thể nộp bài.");
      }
      setCorrections(data.corrections || []);
      setCompletion({ score: data.score, total: data.total });
      toast("Đã lưu điểm thử thách hôm nay.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Không thể nộp thử thách.");
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!started || completion || !question) return;
      const choiceIndex = Number(event.key) - 1;
      if (choiceIndex >= 0 && choiceIndex < question.choices.length) { event.preventDefault(); selectAnswer(question.choices[choiceIndex]); }
      else if (event.key === "Enter" && answers[question.id]) { event.preventDefault(); index === (questions?.length || 1) - 1 ? void submit() : goNext(); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); setIndex((current) => Math.max(0, current - 1)); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const challengeSwipe = useSwipeNavigation({
    onSwipeLeft: goNext,
    onSwipeRight: () => setIndex((current) => Math.max(0, current - 1)),
    canSwipeLeft: Boolean(questions && question && answers[question.id] && index < questions.length - 1),
    canSwipeRight: index > 0,
    enabled: started && !completion && Boolean(question),
  });

  if (questions === null) return <div className={cx.panel}><div className={cx.empty} role="status">Đang mở thử thách hôm nay...</div></div>;
  if (loadError) return <div className={cx.panel}><div className={cx.empty}>Không thể tải thử thách.<div className="mt-3"><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => setLoadAttempt((value) => value + 1)}>Thử lại</button></div></div></div>;

  if (completion) return (
    <div className={cx.panel}>
      <section className="mx-auto max-w-lg rounded-2xl border border-gold bg-goldpale/40 p-6 text-center">
        <div className="text-4xl" aria-hidden="true">🏆</div><h2 className="mt-2 font-serif text-xl font-bold">Đã hoàn thành thử thách hôm nay</h2><div className="mt-3 font-serif text-5xl font-bold text-golddark">{score}/{completion.total}</div><div className="mt-2 text-sm text-muted">{Math.round(score / completion.total * 100)}% chính xác · {score * 10 + 5} XP</div>
        <div className="mt-5 rounded-lg bg-white/70 p-3 text-sm"><div className="text-xs text-muted">Thử thách mới sau</div><div className="mt-1 font-mono text-lg font-bold">{countdown}</div></div>
        <div className="mt-5 flex flex-wrap justify-center gap-2"><Link className={`${cx.btn} ${cx.btnGold}`} href="/leaderboard">Xem bảng xếp hạng</Link>{score < completion.total && <Link className={`${cx.btn} ${cx.btnGhost}`} href="/review">Ôn lại {completion.total - score} từ sai</Link>}<Link className={`${cx.btn} ${cx.btnGhost}`} href="/smart-review">Ôn tập thông minh</Link></div>
      </section>
      {corrections && <section className="mx-auto mt-5 max-w-2xl"><h3 className="mb-3 font-semibold">Xem lại đáp án</h3>{questions.map((item, itemIndex) => { const result = correctionByWord.get(item.id); return <article key={item.id} className={`mb-2 rounded-lg border p-3 ${result?.correct ? "border-ok bg-okbg" : "border-bad/40 bg-badbg"}`}><div className="flex items-start justify-between gap-3"><div><b>{itemIndex + 1}. {item.meaning}</b><div className="mt-1 text-sm">Bạn chọn: {result?.answer || "—"}</div>{!result?.correct && <div className="text-sm text-bad">Đáp án: <b>{result?.correctAnswer}</b></div>}{result?.example && <div className="mt-1 text-xs italic text-muted">VD: {result.example}</div>}</div><span>{result?.correct ? "✓" : "✗"}</span></div></article>; })}</section>}
    </div>
  );

  if (!started) return (
    <div className={cx.panel}>
      <section className="mx-auto max-w-xl rounded-2xl border border-gold bg-gradient-to-br from-goldpale/70 to-white p-6 text-center"><div className="text-5xl" aria-hidden="true">⚡</div><h2 className="mt-3 font-serif text-2xl font-bold">Thử thách ngày {date.split("-").reverse().join("/")}</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted">10 câu giống nhau cho mọi người. Bạn chỉ có một lượt được tính điểm hôm nay.</p><div className="my-5 grid grid-cols-3 gap-2"><div className="rounded-lg bg-white p-3"><b className="block text-xl">10</b><span className="text-xs text-muted">câu hỏi</span></div><div className="rounded-lg bg-white p-3"><b className="block text-xl">+10</b><span className="text-xs text-muted">XP/câu đúng</span></div><div className="rounded-lg bg-white p-3"><b className="block text-xl">1</b><span className="text-xs text-muted">lượt/ngày</span></div></div><button className={`${cx.btn} ${cx.btnGold} px-8`} onClick={() => setStarted(true)}>Bắt đầu thử thách</button></section>
    </div>
  );

  return question ? (
    <div className={cx.panel}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className={cx.h2}>⚡ Thử thách hôm nay</h2><span className="text-sm text-muted">{answeredCount}/{questions.length} đã trả lời</span></div>
      <div className="my-4 flex gap-1.5 overflow-x-auto pb-1">{questions.map((item, itemIndex) => <button key={item.id} aria-label={`Đến câu ${itemIndex + 1}`} className={`h-8 min-w-8 rounded-full border text-xs font-medium ${itemIndex === index ? "border-ink bg-ink text-white" : answers[item.id] ? "border-gold bg-goldpale text-golddark" : "border-line text-muted"}`} onClick={() => setIndex(itemIndex)}>{itemIndex + 1}</button>)}</div>
      <section {...challengeSwipe.swipeProps} style={challengeSwipe.swipeStyle} className="relative mx-auto max-w-xl overflow-hidden rounded-2xl border border-line bg-white p-5 text-center sm:p-8"><span className={`pointer-events-none absolute left-3 top-3 rounded-full bg-[#F0EDFF] px-2.5 py-1 text-xs font-bold text-[#6550DB] transition-opacity ${challengeSwipe.swipeOffset > 18 ? "opacity-100" : "opacity-0"}`}>← Câu trước</span><span className={`pointer-events-none absolute right-3 top-3 rounded-full bg-[#F0EDFF] px-2.5 py-1 text-xs font-bold text-[#6550DB] transition-opacity ${challengeSwipe.swipeOffset < -18 ? "opacity-100" : "opacity-0"}`}>Câu sau →</span><span className={cx.badgeGold}>{question.setName}</span><div className="mt-5 text-xs uppercase tracking-widest text-muted">Nghĩa tiếng Việt</div><div className="mt-2 font-serif text-2xl font-bold">{question.meaning}</div><div className="mt-6 grid gap-2 sm:grid-cols-2">{question.choices.map((choice, choiceIndex) => <button key={choice} className={`rounded-xl border p-3 text-left text-sm ${answers[question.id] === choice ? "border-gold bg-goldpale text-golddark" : "border-line hover:border-gold hover:bg-goldpale/30"}`} onClick={() => selectAnswer(choice)}><span className="mr-2 text-xs text-muted">{choiceIndex + 1}</span>{choice}</button>)}</div>
        <div className="mt-4 text-xs font-semibold text-muted sm:hidden">Chọn đáp án rồi vuốt trái để sang câu tiếp theo</div>
        <div className="mt-6 flex flex-wrap justify-between gap-2"><button className={`${cx.btn} ${cx.btnGhost}`} disabled={index === 0} onClick={() => setIndex((current) => Math.max(0, current - 1))}>← Câu trước</button>{index === questions.length - 1 ? <button ref={nextButtonRef} className={`${cx.btn} ${cx.btnGold}`} disabled={!allAnswered || submitting} onClick={() => void submit()}>{submitting ? "Đang nộp..." : "Nộp thử thách"}<kbd className="ml-2 rounded border border-current/30 px-1 text-[0.65rem]">Enter</kbd></button> : <button ref={nextButtonRef} className={`${cx.btn} ${cx.btnGold}`} disabled={!answers[question.id]} onClick={goNext}>Câu tiếp theo →<kbd className="ml-2 rounded border border-current/30 px-1 text-[0.65rem]">Enter</kbd></button>}</div>
      </section>
    </div>
  ) : null;
}
