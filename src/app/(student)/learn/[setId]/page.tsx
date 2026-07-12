"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { cx } from "@/components/ui";
import SpeakButton from "@/components/SpeakButton";
import { toast } from "@/components/Toast";

type Word = {
  id: number;
  meaning: string;
  v1?: string | null;
  v2?: string | null;
  v3?: string | null;
  term?: string | null;
  example?: string | null;
  wtype?: string | null;
  ipa?: string | null;
};
type SetDetail = { id: number; name: string; type: "irregular_verb" | "ielts_vocab"; words: Word[] };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function LearnPage() {
  const params = useParams<{ setId: string }>();
  const router = useRouter();

  const [set, setSet] = useState<SetDetail | null>(null);
  const [order, setOrder] = useState<Word[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Record<number, boolean>>({});

  useEffect(() => {
    fetch(`/api/sets/${params.setId}`)
      .then((r) => r.json())
      .then((d) => {
        setSet(d.set);
        setOrder(d.set.words);
      });
  }, [params.setId]);

  const isVerb = set?.type === "irregular_verb";
  const word = order[index];
  const total = order.length;

  function goNext() {
    setFlipped(false);
    setIndex((i) => Math.min(i + 1, total - 1));
  }
  function goPrev() {
    setFlipped(false);
    setIndex((i) => Math.max(i - 1, 0));
  }
  function reshuffle() {
    if (!set) return;
    setOrder(shuffle(set.words));
    setIndex(0);
    setFlipped(false);
    toast("Đã xáo trộn lại thứ tự thẻ.");
  }
  function restartInOrder() {
    if (!set) return;
    setOrder(set.words);
    setIndex(0);
    setFlipped(false);
  }

  async function mark(learned: boolean) {
    if (!set || !word) return;
    setKnown((prev) => ({ ...prev, [word.id]: learned }));
    await fetch("/api/mistakes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wordId: word.id, setId: set.id, learned }),
    });
    goNext();
  }

  if (!set) return <div className={cx.panel}><div className={cx.empty}>Đang tải...</div></div>;
  if (total === 0) return <div className={cx.panel}><div className={cx.empty}>Bộ từ vựng này chưa có từ nào.</div></div>;

  const answerText = isVerb ? `${word.v1} — ${word.v2} — ${word.v3}` : word.term || "";
  const speakText = isVerb ? word.v1 || "" : word.term || "";

  return (
    <div className={cx.panel}>
      <div className="flex justify-between items-center mb-2.5 flex-wrap gap-2">
        <h2 className={cx.h2}>📖 Học bài — {set.name}</h2>
        <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => router.push("/study")}>
          ← Chọn bộ khác
        </button>
      </div>
      <div className={cx.desc}>Bấm vào thẻ để lật xem đáp án. Tự đánh giá bạn đã nhớ từ này chưa.</div>

      <div className="text-center text-[0.85rem] text-muted mb-3">
        Thẻ {index + 1} / {total}
      </div>

      <div
        onClick={() => setFlipped((f) => !f)}
        className="cursor-pointer select-none border-2 border-dashed border-gold rounded-2xl bg-white min-h-[220px] flex flex-col items-center justify-center px-6 py-10 mb-5 text-center hover:border-golddark transition-colors"
      >
        {!flipped ? (
          <>
            <div className="text-[0.7rem] text-muted uppercase tracking-widest mb-3">Nghĩa tiếng Việt</div>
            <div className="font-serif text-2xl font-bold">{word.meaning}</div>
            <div className="text-muted text-[0.78rem] mt-4">(Bấm để xem đáp án)</div>
          </>
        ) : (
          <>
            <div className="text-[0.7rem] text-muted uppercase tracking-widest mb-3">
              {isVerb ? "V1 — V2 — V3" : "Từ tiếng Anh"}
            </div>
            <div className="font-serif text-2xl font-bold flex items-center gap-3 flex-wrap justify-center">
              {answerText}
              <SpeakButton text={speakText} />
            </div>
            {word.ipa && <div className="text-golddark text-lg mt-1">{word.ipa}</div>}
            {!isVerb && word.wtype && <div className="text-muted text-[0.8rem] mt-2">({word.wtype})</div>}
            {!isVerb && word.example && <div className="text-muted text-[0.85rem] italic mt-3 max-w-md">VD: {word.example}</div>}
          </>
        )}
      </div>

      <div className="flex gap-2.5 justify-center mb-4 flex-wrap">
        <button
          className={`${cx.btn} border ${known[word.id] === false ? "!bg-badbg !border-bad !text-bad" : cx.btnGhost}`}
          onClick={() => mark(false)}
        >
          ❌ Chưa nhớ
        </button>
        <button
          className={`${cx.btn} border ${known[word.id] === true ? "!bg-okbg !border-ok !text-ok" : cx.btnGhost}`}
          onClick={() => mark(true)}
        >
          ✅ Đã nhớ
        </button>
      </div>

      <div className="flex justify-between items-center flex-wrap gap-2">
        <button className={`${cx.btn} ${cx.btnGhost}`} disabled={index === 0} onClick={goPrev}>
          ◀ Thẻ trước
        </button>
        <div className="flex gap-2.5">
          <button className={`${cx.btn} ${cx.btnGhost}`} onClick={restartInOrder}>
            ↺ Từ đầu
          </button>
          <button className={`${cx.btn} ${cx.btnGhost}`} onClick={reshuffle}>
            🔀 Xáo trộn
          </button>
        </div>
        <button className={`${cx.btn} ${cx.btnGhost}`} disabled={index === total - 1} onClick={goNext}>
          Thẻ sau ▶
        </button>
      </div>
    </div>
  );
}
