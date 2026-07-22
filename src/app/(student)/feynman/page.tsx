"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import SpeakButton from "@/components/SpeakButton";
import { toast } from "@/components/Toast";
import { cx } from "@/components/ui";

type SetRow = { id: number; name: string; type: string; count: number };
type StudyWord = { id: number; setId: number; setName: string; setType: string; meaning: string; term: string | null; v1: string | null; v2: string | null; v3: string | null; example: string | null; wtype: string | null; ipa: string | null; confidence: number | null; reviewCount: number | null; nextReviewAt: string | null };

function target(word: StudyWord) { return word.term || word.v1 || ""; }
function forms(word: StudyWord) { return word.setType === "irregular_verb" ? [word.v1, word.v2, word.v3].filter(Boolean).join(" · ") : target(word); }
function shuffled<T>(values: T[]) { return [...values].sort(() => Math.random() - 0.5); }

export default function FeynmanPage() {
  const [sets, setSets] = useState<SetRow[] | null>(null);
  const [due, setDue] = useState<StudyWord[]>([]);
  const [queue, setQueue] = useState<StudyWord[]>([]);
  const [index, setIndex] = useState(0);
  const [explanation, setExplanation] = useState("");
  const [ownExample, setOwnExample] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sessionSize, setSessionSize] = useState(5);
  const [completed, setCompleted] = useState(0);

  async function loadHome() {
    try {
      const [setRes, dueRes] = await Promise.all([fetch("/api/sets"), fetch("/api/feynman")]);
      if (!setRes.ok || !dueRes.ok) throw new Error();
      const [setData, dueData] = await Promise.all([setRes.json(), dueRes.json()]);
      setSets(setData.sets || []); setDue(dueData.words || []);
    } catch { setSets([]); toast("Không thể tải phòng Feynman."); }
  }
  useEffect(() => { void loadHome(); }, []);

  async function startSet(setId: number) {
    try {
      const response = await fetch(`/api/feynman?setId=${setId}`); const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không thể mở bộ từ.");
      startQueue(shuffled<StudyWord>((data.words || []) as StudyWord[]).slice(0, sessionSize));
    } catch (error) { toast(error instanceof Error ? error.message : "Không thể mở bộ từ."); }
  }
  function startQueue(words: StudyWord[]) { setQueue(words); setIndex(0); setCompleted(0); resetAnswer(); }
  function resetAnswer() { setExplanation(""); setOwnExample(""); setRevealed(false); }
  async function rate(confidence: number) {
    const word = queue[index]; if (!word) return; setSaving(true);
    try {
      const response = await fetch("/api/feynman", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wordId: word.id, simpleExplanation: explanation, ownExample, confidence }) });
      const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || "Không thể lưu.");
      setCompleted((value) => value + 1);
      if (index + 1 < queue.length) { setIndex((value) => value + 1); resetAnswer(); }
      else { setIndex(queue.length); void loadHome(); }
    } catch (error) { toast(error instanceof Error ? error.message : "Không thể lưu kết quả."); }
    finally { setSaving(false); }
  }

  const word = queue[index];
  const progress = queue.length ? Math.round((completed / queue.length) * 100) : 0;
  const containsTarget = useMemo(() => word && explanation.toLocaleLowerCase("vi").includes(target(word).toLocaleLowerCase("vi")), [word, explanation]);

  if (queue.length && index >= queue.length) return <div className={cx.panel}><div className="py-8 text-center"><div className="text-4xl">🎓</div><h2 className="mt-3 font-serif text-xl">Hoàn thành lượt tự giảng lại</h2><p className="mt-2 text-sm text-muted">Bạn đã tự giải thích {completed} từ. Những từ chưa chắc sẽ được xếp lịch ôn sớm hơn.</p><div className="mt-5 flex flex-wrap justify-center gap-2"><button className={`${cx.btn} ${cx.btnGold}`} onClick={() => { setQueue([]); void loadHome(); }}>Về phòng Feynman</button><Link className={`${cx.btn} ${cx.btnGhost}`} href="/progress">Xem tiến độ</Link><Link className={`${cx.btn} ${cx.btnGhost}`} href="/study">Chọn bài học tiếp theo</Link></div></div></div>;

  if (word) return <div className={cx.panel}>
    <div className="mb-4 flex items-center justify-between gap-3"><button className="text-sm text-golddark hover:underline" onClick={() => setQueue([])}>← Thoát phiên</button><span className="text-sm text-muted">Từ {index + 1}/{queue.length}</span></div>
    <div className="mb-5 h-2 overflow-hidden rounded-full bg-[#eee9dc]"><div className="h-full bg-gold transition-all" style={{ width: `${progress}%` }} /></div>
    <div className="mb-4 flex flex-wrap items-center gap-2 text-[0.72rem]"><span className={cx.badgeGold}>S · Khảo sát</span><span className={cx.badgeBlue}>Q · Đặt câu hỏi</span><span className={cx.badgeBlue}>R · Tự thuật lại</span></div>
    <div className="rounded-[10px] border border-line bg-white p-5 text-center"><div className="text-[0.75rem] text-muted">{word.setName}</div><div className="mt-2 flex items-center justify-center gap-2"><h2 className="font-serif text-3xl font-bold">{forms(word)}</h2><SpeakButton text={target(word)} /></div>{word.ipa && <div className="mt-1 text-sm text-muted">{word.ipa} {word.wtype ? `· ${word.wtype}` : ""}</div>}</div>
    <div className="mt-4 rounded-lg bg-[#faf8f2] p-3 text-sm"><b>Câu hỏi dẫn đường:</b> Nếu giải thích từ này cho một em bé 10 tuổi, bạn sẽ nói gì? Khi nào người ta dùng nó?</div>
    <label className="mt-4 block"><span className={cx.label}>Giải thích bằng lời thật đơn giản *</span><textarea autoFocus rows={5} maxLength={2000} className={cx.input} value={explanation} onChange={(event) => setExplanation(event.target.value)} placeholder="Không chép định nghĩa. Hãy dùng cách hiểu của chính bạn..." /></label>
    {containsTarget && <p className="-mt-2 mb-3 text-[0.76rem] text-bad">Gợi ý: thử giải thích mà không dùng lại chính từ “{target(word)}”.</p>}
    <label><span className={cx.label}>Ví dụ do bạn tự đặt</span><textarea rows={2} maxLength={1000} className={cx.input} value={ownExample} onChange={(event) => setOwnExample(event.target.value)} placeholder="Viết một câu hoặc tình huống thực tế..." /></label>
    {!revealed ? <div className="flex justify-end"><button className={`${cx.btn} ${cx.btnGold}`} disabled={explanation.trim().length < 10} onClick={() => setRevealed(true)}>Đã giải thích · Xem đáp án</button></div>
      : <div className="mt-4"><div className="rounded-[10px] border border-ok/30 bg-[#e5f4ea] p-4"><div className="text-[0.72rem] font-semibold uppercase text-ok">Định nghĩa tham chiếu</div><div className="mt-1 font-medium">{word.meaning}</div>{word.example && <div className="mt-2 text-sm italic text-muted">“{word.example}”</div>}</div><p className="mt-4 text-center text-sm font-medium">So sánh với lời giải thích của bạn: mức độ hiểu hiện tại?</p><div className="mt-3 grid gap-2 sm:grid-cols-3"><button disabled={saving} className={`${cx.btn} border border-bad bg-badbg text-bad`} onClick={() => void rate(1)}>1 · Còn mơ hồ<br/><span className="text-[0.68rem] font-normal">Ôn lại sau 1 ngày</span></button><button disabled={saving} className={`${cx.btn} border border-gold bg-goldpale text-golddark`} onClick={() => void rate(2)}>2 · Hiểu phần lớn<br/><span className="text-[0.68rem] font-normal">Ôn lại sau 3–14 ngày</span></button><button disabled={saving} className={`${cx.btn} border border-ok/40 bg-[#e5f4ea] text-ok`} onClick={() => void rate(3)}>3 · Giải thích rõ<br/><span className="text-[0.68rem] font-normal">Ôn lại sau 7–60 ngày</span></button></div></div>}
  </div>;

  return <div className={cx.panel}><div className="mb-5"><h2 className={cx.h2}>Phòng Feynman</h2><p className={cx.desc + " !mb-0"}>Hiểu thật sâu bằng cách tự giảng lại: khảo sát → đặt câu hỏi → tự giải thích → đối chiếu → ôn ngắt quãng.</p></div>
    <div className="mb-5 grid gap-3 sm:grid-cols-3"><div className="rounded-lg border border-line bg-white p-3"><b className="block text-xl">{due.length}</b><span className="text-[0.75rem] text-muted">từ đến lịch tự giảng lại</span></div><div className="rounded-lg border border-line bg-white p-3 sm:col-span-2"><div className="flex flex-wrap items-center gap-2"><span className="text-sm">Số từ mỗi lượt:</span>{[5,10].map((count) => <button key={count} className={`rounded-full border px-3 py-1 text-sm ${sessionSize === count ? "border-ink bg-ink text-white" : "border-line"}`} onClick={() => setSessionSize(count)}>{count}</button>)}{due.length > 0 && <button className={`${cx.btn} ${cx.btnGold} !py-1.5 ml-auto`} onClick={() => startQueue(due.slice(0, sessionSize))}>Ôn từ đến hạn</button>}</div></div></div>
    <h3 className="mb-3 font-serif">Chọn bộ từ để bắt đầu</h3>{sets === null ? <div className={cx.empty}>Đang tải...</div> : sets.length === 0 ? <div className={cx.empty}>Chưa có bộ từ phù hợp.</div> : <div className="grid gap-3 sm:grid-cols-2">{sets.filter((set) => set.count > 0).map((set) => <button key={set.id} onClick={() => void startSet(set.id)} className="lexora-card rounded-[10px] p-4 text-left hover:bg-goldpale/20"><b>{set.name}</b><div className="mt-1 text-[0.75rem] text-muted">{set.count} từ · Bắt đầu tự giảng lại →</div></button>)}</div>}
  </div>;
}
