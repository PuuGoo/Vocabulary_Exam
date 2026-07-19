"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import StudyModeNav from "@/components/StudyModeNav";
import { toast } from "@/components/Toast";
import { cx } from "@/components/ui";

type Word = { id: number; meaning: string; term: string | null; v1: string | null; v2: string | null; v3: string | null; ipa: string | null };
type SetDetail = { id: number; name: string; type: "irregular_verb" | "ielts_vocab"; words: Word[] };

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export default function ListenPage() {
  const params = useParams<{ setId: string }>();
  const router = useRouter();
  const [set, setSet] = useState<SetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [countChoice, setCountChoice] = useState("20");
  const [speed, setSpeed] = useState("0.85");
  const [repeats, setRepeats] = useState("1");
  const [sayMeaning, setSayMeaning] = useState(true);
  const [randomOrder, setRandomOrder] = useState(false);
  const [sessionWords, setSessionWords] = useState<Word[]>([]);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const [progressSaved, setProgressSaved] = useState(false);
  const [progressSaveError, setProgressSaveError] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visitedRef = useRef(new Set<number>());
  const saveAttemptedRef = useRef(false);
  const sequenceRef = useRef(0);

  useEffect(() => {
    let active = true;
    setSpeechSupported("speechSynthesis" in window);
    setLoading(true);
    setLoadError(false);
    fetch(`/api/sets/${params.setId}`)
      .then(async (res) => { if (!res.ok) throw new Error("load failed"); return res.json(); })
      .then((data) => {
        if (!active) return;
        const detail: SetDetail = data.set;
        detail.words = detail.words.filter((word) => Boolean((detail.type === "irregular_verb" ? word.v1 : word.term)?.trim()));
        setSet(detail);
        setLoading(false);
      })
      .catch(() => { if (active) { setLoadError(true); setLoading(false); } });
    return () => { active = false; window.speechSynthesis?.cancel(); if (timerRef.current) clearTimeout(timerRef.current); };
  }, [params.setId, loadAttempt]);

  const word = sessionWords[index];
  const english = word && set ? (set.type === "irregular_verb" ? word.v1 : word.term) || "" : "";

  useEffect(() => {
    if (!started || !playing || finished || !word || !set) return;
    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;
    visitedRef.current.add(word.id);
    window.speechSynthesis.cancel();
    if (timerRef.current) clearTimeout(timerRef.current);

    const utterances: SpeechSynthesisUtterance[] = [];
    for (let repeat = 0; repeat < Number(repeats); repeat += 1) {
      const utterance = new SpeechSynthesisUtterance(english.split("/")[0].trim());
      utterance.lang = "en-US";
      utterance.rate = Number(speed);
      utterances.push(utterance);
    }
    if (sayMeaning && word.meaning.trim()) {
      const meaning = new SpeechSynthesisUtterance(word.meaning);
      meaning.lang = "vi-VN";
      meaning.rate = 0.9;
      utterances.push(meaning);
    }
    const last = utterances[utterances.length - 1];
    last.onend = () => {
      if (sequenceRef.current !== sequence) return;
      timerRef.current = setTimeout(() => {
        if (sequenceRef.current !== sequence) return;
        if (index >= sessionWords.length - 1) {
          setPlaying(false);
          setFinished(true);
        } else {
          setIndex((current) => current + 1);
        }
      }, 650);
    };
    last.onerror = () => { if (sequenceRef.current === sequence) setPlaying(false); };
    utterances.forEach((utterance) => window.speechSynthesis.speak(utterance));
    return () => { sequenceRef.current += 1; window.speechSynthesis.cancel(); if (timerRef.current) clearTimeout(timerRef.current); };
  }, [english, finished, index, playing, repeats, sayMeaning, sessionWords.length, set, speed, started, word]);

  useEffect(() => {
    if (!finished || saveAttemptedRef.current || visitedRef.current.size === 0) return;
    saveAttemptedRef.current = true;
    fetch("/api/listening-progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wordsReviewed: visitedRef.current.size }),
    }).then((res) => { if (!res.ok) throw new Error("save failed"); setProgressSaved(true); })
      .catch(() => { setProgressSaveError(true); toast("Đã nghe xong nhưng chưa thể cập nhật hoạt động hôm nay."); });
  }, [finished]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(target.tagName)) return;
      if (!started || finished) return;
      if (event.code === "Space") { event.preventDefault(); setPlaying((current) => !current); }
      else if (event.key === "ArrowRight") { event.preventDefault(); setIndex((current) => Math.min(sessionWords.length - 1, current + 1)); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); setIndex((current) => Math.max(0, current - 1)); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [finished, sessionWords.length, started]);

  function startSession() {
    if (!set || !speechSupported || set.words.length === 0) return;
    const requested = countChoice === "all" ? set.words.length : Number(countChoice);
    const source = randomOrder ? shuffle(set.words) : set.words;
    setSessionWords(source.slice(0, requested));
    setStarted(true);
    setPlaying(true);
    setIndex(0);
    setFinished(false);
    setProgressSaved(false);
    setProgressSaveError(false);
    visitedRef.current = new Set();
    saveAttemptedRef.current = false;
  }

  function finishSession() {
    window.speechSynthesis.cancel();
    if (timerRef.current) clearTimeout(timerRef.current);
    setPlaying(false);
    setFinished(true);
  }

  if (loading) return <div className={cx.panel}><div className={cx.empty} role="status">Đang chuẩn bị danh sách nghe...</div></div>;
  if (loadError || !set) return <div className={cx.panel}><div className={cx.empty}>Không thể tải bộ từ.<div className="mt-3"><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => setLoadAttempt((value) => value + 1)}>Thử lại</button></div></div></div>;

  if (!started) return (
    <div className={cx.panel}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className={cx.h2}>🎧 Nghe rảnh tay — {set.name}</h2><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => router.push("/study")}>← Chọn bộ khác</button></div>
      <StudyModeNav setId={set.id} active="listen" isVerb={set.type === "irregular_verb"} />
      <div className={cx.desc}>Ứng dụng tự đọc lần lượt để bạn ôn từ mà không cần liên tục nhìn hoặc chạm màn hình.</div>
      {!speechSupported ? <div className={cx.empty}>Trình duyệt này chưa hỗ trợ đọc văn bản. Hãy dùng Chrome, Edge hoặc Safari phiên bản mới.</div> : set.words.length === 0 ? <div className={cx.empty}>Bộ từ chưa có nội dung phù hợp để nghe.</div> : (
        <section className="mx-auto max-w-lg rounded-xl border border-line bg-white p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={cx.label}>Số từ<select className={`${cx.input} mt-1`} value={countChoice} onChange={(event) => setCountChoice(event.target.value)}><option value="10">10 từ</option><option value="20">20 từ</option><option value="50">50 từ</option><option value="all">Toàn bộ ({set.words.length})</option></select></label>
            <label className={cx.label}>Tốc độ đọc<select className={`${cx.input} mt-1`} value={speed} onChange={(event) => setSpeed(event.target.value)}><option value="0.65">Chậm</option><option value="0.85">Vừa</option><option value="1">Tự nhiên</option></select></label>
            <label className={cx.label}>Lặp từ tiếng Anh<select className={`${cx.input} mt-1`} value={repeats} onChange={(event) => setRepeats(event.target.value)}><option value="1">1 lần</option><option value="2">2 lần</option><option value="3">3 lần</option></select></label>
            <div className="space-y-3 pt-1 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={sayMeaning} onChange={(event) => setSayMeaning(event.target.checked)} /> Đọc nghĩa tiếng Việt</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={randomOrder} onChange={(event) => setRandomOrder(event.target.checked)} /> Xáo trộn thứ tự</label>
            </div>
          </div>
          <button className={`${cx.btn} ${cx.btnGold} mt-2 w-full`} onClick={startSession}>▶ Bắt đầu nghe</button>
        </section>
      )}
    </div>
  );

  if (finished) return (
    <div className={cx.panel}>
      <section className="mx-auto max-w-lg rounded-xl border border-gold bg-goldpale/40 p-6 text-center">
        <div className="text-4xl" aria-hidden="true">🎧</div><h2 className="mt-2 font-serif text-xl font-bold">Đã kết thúc lượt nghe</h2>
        <p className="mt-2 text-sm text-muted">Bạn đã nghe {visitedRef.current.size}/{sessionWords.length} từ.</p>
        <div className="mt-3 text-xs text-muted">{progressSaved ? "✓ Đã cập nhật hoạt động hôm nay" : progressSaveError ? "Chưa thể cập nhật hoạt động hôm nay" : "Đang cập nhật tiến độ..."}</div>
        <div className="mt-5 flex flex-wrap justify-center gap-2"><button className={`${cx.btn} ${cx.btnGold}`} onClick={() => setStarted(false)}>Thiết lập lượt mới</button><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => router.push("/study")}>Chọn bộ khác</button></div>
      </section>
    </div>
  );

  return (
    <div className={cx.panel}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className={cx.h2}>🎧 Nghe rảnh tay — {set.name}</h2><span className="text-sm text-muted">{index + 1}/{sessionWords.length}</span></div>
      <StudyModeNav setId={set.id} active="listen" isVerb={set.type === "irregular_verb"} />
      <div className="mb-5 h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-gold transition-[width]" style={{ width: `${(index + 1) / sessionWords.length * 100}%` }} /></div>
      {word && <section className="mx-auto max-w-xl rounded-2xl border border-line bg-white px-5 py-10 text-center">
        <div className={`mx-auto flex h-24 w-24 items-center justify-center rounded-full text-4xl ${playing ? "animate-pulse bg-goldpale" : "bg-line/50"}`} aria-hidden="true">{playing ? "🔊" : "⏸"}</div>
        <div className="mt-6 font-serif text-3xl font-bold">{set.type === "irregular_verb" ? `${word.v1} — ${word.v2} — ${word.v3}` : word.term}</div>
        {word.ipa && <div className="mt-1 text-lg text-golddark">{word.ipa}</div>}
        <div className="mt-4 text-base text-muted">{word.meaning}</div>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button className={`${cx.btn} ${cx.btnGhost}`} disabled={index === 0} onClick={() => setIndex((current) => Math.max(0, current - 1))}>◀ Từ trước</button>
          <button className={`${cx.btn} ${cx.btnGold} min-w-32`} onClick={() => setPlaying((current) => !current)}>{playing ? "⏸ Tạm dừng" : "▶ Tiếp tục"}</button>
          <button className={`${cx.btn} ${cx.btnGhost}`} disabled={index === sessionWords.length - 1} onClick={() => setIndex((current) => Math.min(sessionWords.length - 1, current + 1))}>Từ sau ▶</button>
        </div>
        <div className="mt-4 text-xs text-muted"><kbd className="rounded border border-line px-1.5 py-0.5">Space</kbd> phát/tạm dừng · <kbd className="rounded border border-line px-1.5 py-0.5">← →</kbd> chuyển từ</div>
        <button className="mt-6 text-xs font-medium text-muted underline hover:text-bad" onClick={finishSession}>Kết thúc lượt nghe</button>
      </section>}
    </div>
  );
}
