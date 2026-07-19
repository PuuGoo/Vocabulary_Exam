"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import SpeakButton from "@/components/SpeakButton";
import { toast } from "@/components/Toast";
import { cx } from "@/components/ui";

type Reason = "difficult" | "forgotten" | "stale" | "new";
type ReviewWord = {
  id: number;
  setId: number;
  setName: string;
  setType: string;
  meaning: string;
  v1: string | null;
  v2: string | null;
  v3: string | null;
  term: string | null;
  example: string | null;
  wtype: string | null;
  ipa: string | null;
  known: boolean | null;
  ageDays: number | null;
  timesWrong: number | null;
  reason: Reason;
};
type Summary = { total: number; difficult: number; forgotten: number; stale: number; new: number };

const REASONS: Record<Reason, { label: string; detail: (word: ReviewWord) => string; className: string }> = {
  difficult: {
    label: "Hay trả lời sai",
    detail: (word) => `Bạn đã sai từ này ${word.timesWrong || 1} lần`,
    className: "border-bad/40 bg-badbg text-bad",
  },
  forgotten: {
    label: "Chưa nhớ",
    detail: () => "Bạn đã đánh dấu chưa nhớ ở lần học gần nhất",
    className: "border-gold/50 bg-goldpale text-golddark",
  },
  stale: {
    label: "Đến lúc ôn lại",
    detail: (word) => word.ageDays ? `Lần ôn gần nhất cách đây ${word.ageDays} ngày` : "Đã lâu chưa ôn lại",
    className: "border-[#9eb5cc] bg-[#e4ecf3] text-[#2b4a6b]",
  },
  new: {
    label: "Từ mới",
    detail: () => "Bạn chưa học từ này trước đây",
    className: "border-line bg-[#f4f1e8] text-inksoft",
  },
};

export default function SmartReviewPage() {
  const [count, setCount] = useState("10");
  const [words, setWords] = useState<ReviewWord[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState({ known: 0, unknown: 0 });
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    setWords(null);
    setLoadError(false);
    fetch(`/api/smart-review?count=${count}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("load failed");
        return res.json();
      })
      .then((data) => {
        if (!active) return;
        setWords(data.words || []);
        setSummary(data.summary);
        setIndex(0);
        setFlipped(false);
        setResults({ known: 0, unknown: 0 });
      })
      .catch(() => { if (active) { setWords([]); setLoadError(true); } });
    return () => { active = false; };
  }, [count, loadAttempt]);

  const word = words?.[index];
  const finished = !!words && words.length > 0 && index >= words.length;

  const mark = useCallback(async (learned: boolean) => {
    if (!word || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/mistakes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wordId: word.id, setId: word.setId, learned }),
      });
      if (!res.ok) throw new Error("save failed");
      setResults((current) => ({
        known: current.known + (learned ? 1 : 0),
        unknown: current.unknown + (learned ? 0 : 1),
      }));
      setIndex((current) => current + 1);
      setFlipped(false);
    } catch {
      toast("Không thể lưu kết quả. Vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  }, [saving, word]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      if ((event.key === " " || event.key === "Enter") && word) {
        event.preventDefault();
        setFlipped((current) => !current);
      } else if (event.key === "1" && word && !saving) {
        event.preventDefault();
        void mark(false);
      } else if (event.key === "2" && word && !saving) {
        event.preventDefault();
        void mark(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mark, saving, word]);

  if (words === null) return <div className={cx.panel}><div className={cx.empty} role="status">Đang tạo lịch ôn phù hợp với bạn...</div></div>;

  return (
    <div className={cx.panel}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className={cx.h2}>🧠 Ôn tập thông minh</h2>
          <div className={cx.desc}>Tự động ưu tiên từ hay sai, chưa nhớ và những từ đã đến lúc ôn lại.</div>
        </div>
        <label className="text-xs text-muted">
          Số từ trong lượt
          <select className={`${cx.input} !mb-0 mt-1 !w-auto`} value={count} onChange={(event) => setCount(event.target.value)}>
            <option value="5">5 từ</option><option value="10">10 từ</option><option value="20">20 từ</option>
          </select>
        </label>
      </div>

      {loadError ? (
        <div className={cx.empty}>Không thể tạo lượt ôn.<div className="mt-3"><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => setLoadAttempt((value) => value + 1)}>Thử lại</button></div></div>
      ) : words.length === 0 ? (
        <div className={cx.empty}>Bạn chưa có từ nào đến hạn ôn. Hãy học thêm từ mới hoặc quay lại sau.<div className="mt-3"><Link className={`${cx.btn} ${cx.btnGold}`} href="/study">Chọn bộ từ để học</Link></div></div>
      ) : finished ? (
        <section className="mt-5 rounded-xl border border-gold bg-goldpale/40 p-6 text-center">
          <div className="text-4xl" aria-hidden="true">🎉</div>
          <h3 className="mt-2 font-serif text-xl font-bold">Hoàn thành lượt ôn!</h3>
          <p className="mt-2 text-sm text-muted">Đã nhớ {results.known} từ · Cần ôn lại {results.unknown} từ</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button className={`${cx.btn} ${cx.btnGold}`} onClick={() => setLoadAttempt((value) => value + 1)}>Tạo lượt ôn mới</button>
            <Link className={`${cx.btn} ${cx.btnGhost}`} href="/progress">Xem tiến độ</Link>
          </div>
        </section>
      ) : word ? (
        <>
          {summary && (
            <div className="my-4 flex flex-wrap gap-2 text-xs">
              {summary.difficult > 0 && <span className="rounded-full bg-badbg px-3 py-1 text-bad">{summary.difficult} từ hay sai</span>}
              {summary.forgotten > 0 && <span className="rounded-full bg-goldpale px-3 py-1 text-golddark">{summary.forgotten} từ chưa nhớ</span>}
              {summary.stale > 0 && <span className="rounded-full bg-[#e4ecf3] px-3 py-1 text-[#2b4a6b]">{summary.stale} từ đến hạn</span>}
              {summary.new > 0 && <span className="rounded-full bg-line/50 px-3 py-1 text-muted">{summary.new} từ mới</span>}
            </div>
          )}
          <div className="mb-3 flex items-center justify-between gap-3 text-xs text-muted">
            <span>Thẻ {index + 1}/{words.length}</span><span>{word.setName}</span>
          </div>
          <div className="mb-4 h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-gold transition-[width]" style={{ width: `${(index / words.length) * 100}%` }} /></div>
          <div className={`mb-3 inline-flex rounded-full border px-3 py-1 text-xs font-medium ${REASONS[word.reason].className}`} title={REASONS[word.reason].detail(word)}>
            {REASONS[word.reason].label} · {REASONS[word.reason].detail(word)}
          </div>
          <button
            type="button"
            onClick={() => setFlipped((current) => !current)}
            className="flex min-h-[250px] w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gold bg-white px-6 py-10 text-center transition-colors hover:border-golddark"
          >
            {!flipped ? (
              <><span className="mb-3 text-[0.7rem] uppercase tracking-widest text-muted">Nghĩa tiếng Việt</span><span className="font-serif text-2xl font-bold">{word.meaning}</span><span className="mt-5 text-xs text-muted">Bấm hoặc nhấn Space để xem đáp án</span></>
            ) : (
              <><span className="mb-3 text-[0.7rem] uppercase tracking-widest text-muted">{word.setType === "irregular_verb" ? "V1 — V2 — V3" : "Từ tiếng Anh"}</span><span className="flex flex-wrap items-center justify-center gap-3 font-serif text-2xl font-bold">{word.setType === "irregular_verb" ? `${word.v1} — ${word.v2} — ${word.v3}` : word.term}<span onClick={(event) => event.stopPropagation()}><SpeakButton text={word.setType === "irregular_verb" ? word.v1 || "" : word.term || ""} /></span></span>{word.ipa && <span className="mt-1 text-lg text-golddark">{word.ipa}</span>}{word.wtype && <span className="mt-2 text-sm text-muted">({word.wtype})</span>}{word.example && <span className="mt-3 max-w-xl text-sm italic text-muted">VD: {word.example}</span>}</>
            )}
          </button>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button className={`${cx.btn} ${cx.btnGhost} border-bad/50 text-bad`} disabled={saving} onClick={() => void mark(false)}>❌ Chưa nhớ <kbd className="ml-1 rounded border border-current/30 px-1.5 py-0.5 text-[0.68rem]">1</kbd></button>
            <button className={`${cx.btn} ${cx.btnGold}`} disabled={saving} onClick={() => void mark(true)}>✅ Đã nhớ <kbd className="ml-1 rounded border border-current/30 px-1.5 py-0.5 text-[0.68rem]">2</kbd></button>
          </div>
          {saving && <div className="mt-2 text-center text-xs text-muted" role="status">Đang lưu kết quả...</div>}
        </>
      ) : null}
    </div>
  );
}
