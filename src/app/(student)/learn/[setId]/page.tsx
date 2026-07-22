"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { cx } from "@/components/ui";
import SpeakButton from "@/components/SpeakButton";
import StudyModeNav from "@/components/StudyModeNav";
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [order, setOrder] = useState<Word[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Record<number, boolean>>({});
  const [jumpValue, setJumpValue] = useState("");
  const [reviewUnknown, setReviewUnknown] = useState(false);
  const [savingWordId, setSavingWordId] = useState<number | null>(null);
  const [bookmarkIdByWordId, setBookmarkIdByWordId] = useState<Record<number, number>>({});
  const [savingBookmarkWordId, setSavingBookmarkWordId] = useState<number | null>(null);
  const [resumedPosition, setResumedPosition] = useState<number | null>(null);
  const savingRef = useRef(false);
  const sessionSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionSaveErrorShownRef = useRef(false);

  async function loadSet() {
    setLoading(true);
    setLoadError(false);
    setResumedPosition(null);
    try {
      const [res, bookmarksRes, sessionsRes] = await Promise.all([
        fetch(`/api/sets/${params.setId}`),
        fetch("/api/bookmarks").catch(() => null),
        fetch("/api/study-sessions").catch(() => null),
      ]);
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      if (!data.set) throw new Error("missing set");
      setSet(data.set);
      setOrder(data.set.words);
      setKnown(data.progress || {});
      if (bookmarksRes?.ok) {
        const bookmarksData = await bookmarksRes.json();
        setBookmarkIdByWordId(Object.fromEntries((bookmarksData.bookmarks || []).map((item: { wordId: number; id: number }) => [item.wordId, item.id])));
      }
      let resumeIndex = 0;
      if (sessionsRes?.ok) {
        const sessionsData = await sessionsRes.json();
        const saved = (sessionsData.sessions || []).find((item: { setId: number }) => item.setId === data.set.id);
        const savedIndex = saved ? data.set.words.findIndex((item: Word) => item.id === saved.wordId) : -1;
        if (savedIndex > 0) {
          resumeIndex = savedIndex;
          setResumedPosition(savedIndex + 1);
        } else {
          setResumedPosition(null);
        }
      }
      setIndex(resumeIndex);
      setFlipped(false);
      setReviewUnknown(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.setId]);

  const isVerb = set?.type === "irregular_verb";
  const word = order[index];
  const total = order.length;
  const unknownCount = set ? set.words.filter((item) => known[item.id] === false).length : 0;
  const knownCount = set ? set.words.filter((item) => known[item.id] === true).length : 0;
  const unratedCount = set ? set.words.length - knownCount - unknownCount : 0;

  useEffect(() => {
    if (loading || !set || !word) return;
    if (sessionSaveTimerRef.current) clearTimeout(sessionSaveTimerRef.current);
    const position = set.words.findIndex((item) => item.id === word.id) + 1;
    if (position <= 0) return;
    sessionSaveTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/study-sessions", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ setId: set.id, wordId: word.id, position }),
        });
        if (!res.ok) throw new Error("save failed");
        sessionSaveErrorShownRef.current = false;
      } catch {
        if (!sessionSaveErrorShownRef.current) {
          toast("Chưa thể lưu vị trí học gần nhất.");
          sessionSaveErrorShownRef.current = true;
        }
      }
    }, 500);
    return () => {
      if (sessionSaveTimerRef.current) clearTimeout(sessionSaveTimerRef.current);
    };
  }, [loading, set, word]);

  function goNext() {
    setFlipped(false);
    setIndex((i) => Math.min(i + 1, total - 1));
  }
  function goPrev() {
    setFlipped(false);
    setIndex((i) => Math.max(i - 1, 0));
  }
  function goToIndex(n: number) {
    if (total === 0) return;
    const clamped = Math.min(Math.max(n, 1), total) - 1;
    setFlipped(false);
    setIndex(clamped);
  }
  function submitJump() {
    const n = Number(jumpValue);
    if (!jumpValue.trim() || Number.isNaN(n)) {
      toast("Nhập số thứ tự thẻ hợp lệ.");
      return;
    }
    goToIndex(n);
    setJumpValue("");
  }
  function reshuffle() {
    if (!set) return;
    const words = reviewUnknown ? set.words.filter((item) => known[item.id] === false) : set.words;
    setOrder(shuffle(words));
    setIndex(0);
    setFlipped(false);
    toast("Đã xáo trộn lại thứ tự thẻ.");
  }
  function restartInOrder() {
    if (!set) return;
    setOrder(reviewUnknown ? set.words.filter((item) => known[item.id] === false) : set.words);
    setIndex(0);
    setFlipped(false);
    setResumedPosition(null);
  }

  function startUnknownReview() {
    if (!set || unknownCount === 0) return;
    setReviewUnknown(true);
    setOrder(set.words.filter((item) => known[item.id] === false));
    setIndex(0);
    setFlipped(false);
  }

  function showAllWords() {
    if (!set) return;
    setReviewUnknown(false);
    setOrder(set.words);
    setIndex(0);
    setFlipped(false);
  }

  async function mark(learned: boolean) {
    if (!set || !word || savingRef.current) return;
    const markedWord = word;
    const previousKnown = known[markedWord.id];
    const previousOrder = order;
    const previousIndex = index;
    const previousFlipped = flipped;
    savingRef.current = true;
    setSavingWordId(markedWord.id);
    setKnown((prev) => ({ ...prev, [markedWord.id]: learned }));
    if (reviewUnknown && learned) {
      setOrder((prev) => prev.filter((item) => item.id !== word.id));
      setIndex((current) => Math.max(0, Math.min(current, total - 2)));
      setFlipped(false);
    } else {
      goNext();
    }
    try {
      const res = await fetch("/api/mistakes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wordId: markedWord.id, setId: set.id, learned }),
      });
      if (!res.ok) throw new Error("save failed");
    } catch {
      setKnown((current) => {
        const next = { ...current };
        if (previousKnown === undefined) delete next[markedWord.id];
        else next[markedWord.id] = previousKnown;
        return next;
      });
      setOrder(previousOrder);
      setIndex(previousIndex);
      setFlipped(previousFlipped);
      toast("Không thể lưu đánh giá. Thẻ đã được khôi phục để bạn thử lại.");
    } finally {
      savingRef.current = false;
      setSavingWordId(null);
    }
  }

  async function toggleBookmark(wordId: number) {
    if (savingBookmarkWordId !== null) return;
    const bookmarkId = bookmarkIdByWordId[wordId];
    setSavingBookmarkWordId(wordId);
    try {
      const res = await fetch(bookmarkId ? `/api/bookmarks/${bookmarkId}` : "/api/bookmarks", {
        method: bookmarkId ? "DELETE" : "POST",
        headers: bookmarkId ? undefined : { "Content-Type": "application/json" },
        body: bookmarkId ? undefined : JSON.stringify({ wordId }),
      });
      if (!res.ok) throw new Error("bookmark failed");
      if (bookmarkId) {
        setBookmarkIdByWordId((current) => {
          const next = { ...current };
          delete next[wordId];
          return next;
        });
        toast("Đã bỏ từ khỏi sổ tay.");
      } else {
        const data = await res.json();
        setBookmarkIdByWordId((current) => ({ ...current, [wordId]: data.bookmark.id }));
        toast("Đã lưu từ vào sổ tay.");
      }
    } catch {
      toast("Không thể cập nhật sổ tay. Vui lòng thử lại.");
    } finally {
      setSavingBookmarkWordId(null);
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === "1" && !savingRef.current) {
        e.preventDefault();
        void mark(false);
      } else if (e.key === "2" && !savingRef.current) {
        e.preventDefault();
        void mark(true);
      } else if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        reshuffle();
      } else if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        restartInOrder();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, word?.id, reviewUnknown, known, set]);

  if (loading) return <div className={cx.panel}><div className={cx.empty} role="status">Đang tải bộ từ...</div></div>;
  if (loadError || !set) return (
    <div className={cx.panel}>
      <div className={cx.empty}>
        Không thể tải bộ từ vựng.
        <div className="mt-3 flex justify-center gap-2">
          <button className={`${cx.btn} ${cx.btnGold}`} onClick={() => void loadSet()}>Thử lại</button>
          <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => router.push("/study")}>Chọn bộ khác</button>
        </div>
      </div>
    </div>
  );
  if (total === 0 && !reviewUnknown) return (
    <div className={cx.panel}>
      <div className={cx.empty}>
        Bộ từ vựng này chưa có từ nào.
        <div className="mt-3"><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => router.push("/study")}>← Chọn bộ khác</button></div>
      </div>
    </div>
  );

  const answerText = isVerb ? `${word?.v1} — ${word?.v2} — ${word?.v3}` : word?.term || "";
  const speakText = isVerb ? word?.v1 || "" : word?.term || "";

  return (
    <div className={cx.panel}>
      <div className="flex justify-between items-center mb-2.5 flex-wrap gap-2">
        <h2 className={cx.h2}>📖 Học bài — {set.name}</h2>
        <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => router.push("/study")}>
          ← Chọn bộ khác
        </button>
      </div>
      <StudyModeNav setId={set.id} active="learn" isVerb={isVerb} />
      <div className={cx.desc}>
        Bấm vào thẻ để lật xem đáp án. Tự đánh giá bạn đã nhớ từ này chưa. Dùng phím ← → để chuyển thẻ, phím
        Space/Enter để lật thẻ.
      </div>

      {resumedPosition && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-gold bg-goldpale px-4 py-3 text-[0.84rem] flex-wrap">
          <span>↪ Đã tiếp tục từ vị trí trước: thẻ <b>{resumedPosition}</b>/{set.words.length}.</span>
          <button className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} onClick={restartInOrder}>Học lại từ đầu</button>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-line bg-white px-4 py-3 flex-wrap">
        <div className="text-[0.85rem]">
          {reviewUnknown ? (
            <><b>Đang ôn riêng từ chưa nhớ</b> · còn {total} từ</>
          ) : (
            <div className="flex gap-x-3 gap-y-1 flex-wrap">
              <span><b className="text-ok">{knownCount}</b> đã nhớ</span>
              <span><b className="text-bad">{unknownCount}</b> chưa nhớ</span>
              <span><b>{unratedCount}</b> chưa đánh giá</span>
            </div>
          )}
        </div>
        {reviewUnknown ? (
          <button className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} onClick={showAllWords}>Xem tất cả từ</button>
        ) : (
          <button
            className={`${cx.btn} ${cx.btnGold} !px-3 !py-1.5`}
            disabled={unknownCount === 0}
            onClick={startUnknownReview}
          >
            Ôn riêng từ chưa nhớ ({unknownCount})
          </button>
        )}
      </div>

      {reviewUnknown && total === 0 ? (
        <div className={cx.empty}>
          🎉 Bạn đã nhớ hết các từ trong lượt ôn này.
          <div className="mt-3">
            <button className={`${cx.btn} ${cx.btnGhost}`} onClick={showAllWords}>Xem lại tất cả từ</button>
          </div>
        </div>
      ) : (
      <>

      <div className="flex items-center justify-center gap-2 flex-wrap mb-3">
        <div className="text-[0.85rem] text-muted">
          Thẻ {index + 1} / {total}
        </div>
        <input
          type="number"
          min={1}
          max={total}
          placeholder="Số thẻ"
          value={jumpValue}
          onChange={(e) => setJumpValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitJump();
          }}
          className={`${cx.input} !mb-0 !w-24 !py-1`}
        />
        <button className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} onClick={submitJump}>
          Đi tới
        </button>
      </div>

      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-line" aria-label={`Tiến độ thẻ ${index + 1} trên ${total}`}>
        <div className="h-full rounded-full bg-gold transition-[width]" style={{ width: `${((index + 1) / total) * 100}%` }} />
      </div>

      <div
        onClick={() => setFlipped((f) => !f)}
        className="relative cursor-pointer select-none border-2 border-dashed border-gold rounded-2xl bg-white min-h-[220px] flex flex-col items-center justify-center px-6 py-10 mb-5 text-center hover:border-golddark transition-colors"
      >
        <button
          type="button"
          title={bookmarkIdByWordId[word.id] ? "Bỏ khỏi sổ tay" : "Lưu vào sổ tay"}
          aria-label={bookmarkIdByWordId[word.id] ? "Bỏ từ này khỏi sổ tay" : "Lưu từ này vào sổ tay"}
          disabled={savingBookmarkWordId !== null}
          onClick={(event) => {
            event.stopPropagation();
            void toggleBookmark(word.id);
          }}
          className={`absolute right-3 top-3 rounded-full border px-3 py-1.5 text-[0.78rem] transition-colors disabled:opacity-50 ${
            bookmarkIdByWordId[word.id] ? "border-gold bg-goldpale text-golddark" : "border-line bg-white text-muted hover:border-gold hover:text-golddark"
          }`}
        >
          {savingBookmarkWordId === word.id ? "Đang lưu..." : bookmarkIdByWordId[word.id] ? "★ Đã lưu" : "☆ Lưu vào sổ"}
        </button>
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
          disabled={savingWordId !== null}
          onClick={() => mark(false)}
        >
          ❌ Chưa nhớ <kbd className="ml-1 rounded border border-current/30 px-1.5 py-0.5 text-[0.68rem]">1</kbd>
        </button>
        <button
          className={`${cx.btn} border ${known[word.id] === true ? "!bg-okbg !border-ok !text-ok" : cx.btnGhost}`}
          disabled={savingWordId !== null}
          onClick={() => mark(true)}
        >
          ✅ Đã nhớ <kbd className="ml-1 rounded border border-current/30 px-1.5 py-0.5 text-[0.68rem]">2</kbd>
        </button>
      </div>
      {savingWordId !== null && (
        <div className="-mt-2 mb-3 text-center text-[0.75rem] text-muted" role="status">Đang lưu đánh giá...</div>
      )}

      {index === total - 1 && known[word.id] !== undefined && savingWordId === null && (
        <section className="mb-4 rounded-xl border border-gold bg-goldpale/50 p-4 text-center" role="status">
          <div className="text-2xl" aria-hidden="true">🎉</div>
          <h3 className="mt-1 font-serif text-lg font-bold">Bạn đã xem hết lượt thẻ này</h3>
          <p className="mt-1 text-sm text-muted">Đã nhớ {knownCount} từ · Chưa nhớ {unknownCount} từ · Chưa đánh giá {unratedCount} từ.</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {unknownCount > 0 && !reviewUnknown && <button className={`${cx.btn} ${cx.btnGold}`} onClick={startUnknownReview}>Ôn ngay {unknownCount} từ chưa nhớ</button>}
            <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => router.push(`/quiz/${set.id}?mode=${isVerb ? "fill" : "mc"}`)}>{isVerb ? "Chuyển sang điền V1/V2/V3" : "Chuyển sang trắc nghiệm"}</button>
            <button className={`${cx.btn} ${cx.btnGhost}`} onClick={restartInOrder}>Học lại từ đầu</button>
          </div>
        </section>
      )}

      <div className="flex justify-between items-center flex-wrap gap-2">
        <button className={`${cx.btn} ${cx.btnGhost}`} disabled={index === 0} onClick={goPrev}>
          ◀ Thẻ trước
        </button>
        <div className="flex gap-2.5">
          <button className={`${cx.btn} ${cx.btnGhost}`} onClick={restartInOrder}>
            ↺ Từ đầu <kbd className="ml-1 rounded border border-line px-1.5 py-0.5 text-[0.68rem]">R</kbd>
          </button>
          <button className={`${cx.btn} ${cx.btnGhost}`} onClick={reshuffle}>
            🔀 Xáo trộn <kbd className="ml-1 rounded border border-line px-1.5 py-0.5 text-[0.68rem]">S</kbd>
          </button>
        </div>
        <button className={`${cx.btn} ${cx.btnGhost}`} disabled={index === total - 1} onClick={goNext}>
          Thẻ sau ▶
        </button>
      </div>
      </>
      )}
    </div>
  );
}
