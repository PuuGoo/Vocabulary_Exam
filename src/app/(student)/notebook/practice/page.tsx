"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cx } from "@/components/ui";
import SpeakButton from "@/components/SpeakButton";
import { toast } from "@/components/Toast";

type Bookmark = {
  id: number;
  wordId: number;
  setId: number;
  setName: string;
  setType: "irregular_verb" | "ielts_vocab";
  meaning: string;
  term: string | null;
  v1: string | null;
  v2: string | null;
  v3: string | null;
  ipa: string | null;
  example: string | null;
  note: string;
};

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export default function NotebookPracticePage() {
  const [bookmarks, setBookmarks] = useState<Bookmark[] | null>(null);
  const [order, setOrder] = useState<Bookmark[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState<Record<number, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [finished, setFinished] = useState(false);
  const [reviewingWeak, setReviewingWeak] = useState(false);
  const [loadError, setLoadError] = useState(false);

  async function load() {
    setLoadError(false);
    try {
      const response = await fetch("/api/bookmarks");
      if (!response.ok) throw new Error("load failed");
      const data = await response.json();
      const rows: Bookmark[] = data.bookmarks || [];
      setBookmarks(rows);
      setOrder(shuffle(rows));
    } catch {
      setBookmarks([]);
      setLoadError(true);
    }
  }

  useEffect(() => { void load(); }, []);

  const word = order[index];
  const knownCount = Object.values(results).filter(Boolean).length;
  const weakCount = Object.values(results).filter((value) => !value).length;

  function startRound(words: Bookmark[], weakOnly: boolean) {
    setOrder(shuffle(words));
    setIndex(0);
    setFlipped(false);
    setResults({});
    setFinished(false);
    setReviewingWeak(weakOnly);
  }

  async function mark(learned: boolean) {
    if (!word || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/mistakes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wordId: word.wordId, setId: word.setId, learned }),
      });
      if (!response.ok) throw new Error("save failed");
      setResults((current) => ({ ...current, [word.wordId]: learned }));
      if (index === order.length - 1) setFinished(true);
      else {
        setIndex((value) => value + 1);
        setFlipped(false);
      }
    } catch {
      toast("Không thể lưu đánh giá. Vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(target.tagName)) return;
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        setFlipped((value) => !value);
      } else if (event.key === "1" && !saving) {
        event.preventDefault();
        void mark(false);
      } else if (event.key === "2" && !saving) {
        event.preventDefault();
        void mark(true);
      }
    }
    if (!finished) window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word?.wordId, saving, finished]);

  if (bookmarks === null) return <div className={cx.panel}><div className={cx.empty} role="status">Đang chuẩn bị từ trong sổ tay...</div></div>;
  if (loadError) return <div className={cx.panel}><div className={cx.empty}>Không thể tải từ trong sổ tay.<div className="mt-3"><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => void load()}>Thử lại</button></div></div></div>;
  if (bookmarks.length === 0) return <div className={cx.panel}><div className={cx.empty}>Sổ tay chưa có từ nào để luyện.<div className="mt-3"><Link className={`${cx.btn} ${cx.btnGold}`} href="/dictionary">Tra cứu và lưu từ</Link></div></div></div>;

  if (finished) {
    const weakWords = order.filter((item) => results[item.wordId] === false);
    return (
      <div className={cx.panel}>
        <h2 className={`${cx.h2} text-center`}>Hoàn thành lượt luyện sổ tay</h2>
        <div className="mx-auto my-6 grid max-w-md grid-cols-2 gap-3">
          <div className="rounded-xl border border-ok bg-okbg p-5 text-center"><b className="font-serif text-3xl text-ok">{knownCount}</b><div className="mt-1 text-xs text-muted">Đã nhớ</div></div>
          <div className="rounded-xl border border-bad bg-badbg p-5 text-center"><b className="font-serif text-3xl text-bad">{weakCount}</b><div className="mt-1 text-xs text-muted">Chưa nhớ</div></div>
        </div>
        <div className="flex justify-center gap-2 flex-wrap">
          {weakWords.length > 0 && <button className={`${cx.btn} ${cx.btnGold}`} onClick={() => startRound(weakWords, true)}>Ôn lại {weakWords.length} từ chưa nhớ</button>}
          <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => startRound(bookmarks, false)}>Luyện lại tất cả</button>
          <Link className={`${cx.btn} ${cx.btnGhost}`} href="/notebook">Về sổ tay</Link>
        </div>
      </div>
    );
  }

  const answer = word.setType === "irregular_verb" ? `${word.v1} — ${word.v2} — ${word.v3}` : word.term || "";
  const speakText = word.setType === "irregular_verb" ? word.v1 : word.term;

  return (
    <div className={cx.panel}>
      <div className="mb-2.5 flex items-center justify-between gap-2 flex-wrap">
        <h2 className={cx.h2}>📖 {reviewingWeak ? "Ôn từ chưa nhớ" : "Luyện từ trong sổ tay"}</h2>
        <Link className={`${cx.btn} ${cx.btnGhost}`} href="/notebook">← Về sổ tay</Link>
      </div>
      <div className={cx.desc}>Bấm vào thẻ hoặc nhấn Space/Enter để xem đáp án. Dùng phím 1 và 2 để tự đánh giá.</div>

      <div className="mb-3 flex items-center justify-between text-sm text-muted">
        <span>Thẻ {index + 1}/{order.length}</span>
        <span>{knownCount} đã nhớ · {weakCount} chưa nhớ</span>
      </div>
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-gold transition-[width]" style={{ width: `${(index / order.length) * 100}%` }} />
      </div>

      <button
        type="button"
        className="flex min-h-[250px] w-full cursor-pointer select-none flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gold bg-white px-6 py-10 text-center transition-colors hover:border-golddark"
        aria-label={flipped ? "Đang hiện đáp án, bấm để xem nghĩa" : "Đang hiện nghĩa, bấm để xem đáp án"}
        onClick={() => setFlipped((value) => !value)}
      >
        <span className="mb-3 text-[0.68rem] uppercase tracking-widest text-muted">{word.setName}</span>
        {!flipped ? (
          <>
            <span className="text-[0.7rem] uppercase tracking-widest text-muted">Nghĩa tiếng Việt</span>
            <span className="mt-3 font-serif text-2xl font-bold">{word.meaning}</span>
            <span className="mt-4 text-xs text-muted">Bấm để xem đáp án</span>
          </>
        ) : (
          <>
            <span className="text-[0.7rem] uppercase tracking-widest text-muted">Đáp án</span>
            <span className="mt-3 font-serif text-2xl font-bold">{answer}</span>
            {word.ipa && <span className="mt-1 text-golddark">{word.ipa}</span>}
            {word.example && <span className="mt-3 max-w-md text-sm italic text-muted">VD: {word.example}</span>}
            {word.note && <span className="mt-3 max-w-md rounded-lg bg-goldpale px-3 py-2 text-sm text-golddark">Ghi chú: {word.note}</span>}
          </>
        )}
      </button>

      {flipped && (
        <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted">
          <SpeakButton text={speakText || ""} /> Nghe phát âm
        </div>
      )}

      <div className="mt-5 flex justify-center gap-3 flex-wrap">
        <button className={`${cx.btn} ${cx.btnGhost}`} disabled={saving} onClick={() => void mark(false)}>❌ Chưa nhớ <kbd className="ml-1 rounded border border-current/30 px-1.5 py-0.5 text-[0.68rem]">1</kbd></button>
        <button className={`${cx.btn} ${cx.btnGold}`} disabled={saving} onClick={() => void mark(true)}>✅ Đã nhớ <kbd className="ml-1 rounded border border-current/30 px-1.5 py-0.5 text-[0.68rem]">2</kbd></button>
      </div>
      {saving && <div className="mt-2 text-center text-xs text-muted" role="status">Đang lưu đánh giá...</div>}
    </div>
  );
}
