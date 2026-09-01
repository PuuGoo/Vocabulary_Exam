"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cx } from "@/components/ui";
import SpeakButton from "@/components/SpeakButton";
import { toast } from "@/components/Toast";
import { groupMistakesBySet, type MistakeRow } from "@/lib/reviewGroups";
import { normalizeSearch } from "@/lib/search";

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

type TabKey = "lookup" | "saved" | "review";

const TABS: Array<{ id: TabKey; label: string; icon: string }> = [
  { id: "lookup", label: "Tra cứu", icon: "⌕" },
  { id: "saved", label: "Đã lưu", icon: "★" },
  { id: "review", label: "Cần ôn", icon: "↻" },
];

export default function MyWordsPage() {
  const [tab, setTab] = useState<TabKey>("lookup");
  const [bookmarks, setBookmarks] = useState<Bookmark[] | null>(null);
  const [mistakes, setMistakes] = useState<MistakeRow[] | null>(null);
  const [mistakeError, setMistakeError] = useState(false);
  const [savedQuery, setSavedQuery] = useState("");
  const [reviewQuery, setReviewQuery] = useState("");
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  async function loadAll() {
    setBookmarks(null);
    setMistakes(null);
    setMistakeError(false);
    try {
      const [bookmarkRes, mistakeRes] = await Promise.all([fetch("/api/bookmarks"), fetch("/api/mistakes")]);
      if (!bookmarkRes.ok || !mistakeRes.ok) throw new Error("load failed");
      const [bookmarkData, mistakeData] = await Promise.all([bookmarkRes.json(), mistakeRes.json()]);
      setBookmarks(bookmarkData.bookmarks || []);
      setMistakes(mistakeData.mistakes || []);
    } catch {
      setBookmarks([]);
      setMistakes([]);
      setMistakeError(true);
    }
  }

  useEffect(() => { void loadAll(); }, []);

  const filteredSaved = useMemo(() => {
    const q = normalizeSearch(savedQuery);
    if (!q || !bookmarks) return bookmarks || [];
    return bookmarks.filter((row) => normalizeSearch(`${row.setName} ${row.meaning} ${row.term || ""} ${row.v1 || ""} ${row.v2 || ""} ${row.v3 || ""} ${row.note}`).includes(q));
  }, [bookmarks, savedQuery]);

  const filteredMistakes = useMemo(() => {
    const q = normalizeSearch(reviewQuery);
    if (!q || !mistakes) return mistakes || [];
    return mistakes.filter((row) => normalizeSearch(`${row.setName} ${row.meaning} ${row.term || ""} ${row.v1 || ""} ${row.v2 || ""} ${row.v3 || ""}`).includes(q));
  }, [mistakes, reviewQuery]);

  async function removeBookmark(bookmark: Bookmark) {
    if (removingId !== null) return;
    setRemovingId(bookmark.id);
    try {
      const res = await fetch(`/api/bookmarks/${bookmark.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      setBookmarks((current) => current?.filter((row) => row.id !== bookmark.id) || current);
      toast("Đã bỏ khỏi danh sách đã lưu.");
    } catch {
      toast("Không thể bỏ từ khỏi sổ tay.");
    } finally {
      setRemovingId(null);
    }
  }

  async function markLearned(id: number) {
    if (removingId !== null) return;
    setRemovingId(id);
    try {
      const res = await fetch(`/api/mistakes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      toast("Đã đánh dấu là thuộc.");
      setMistakes((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
    } catch {
      toast("Không thể cập nhật từ này.");
    } finally {
      setRemovingId(null);
    }
  }

  const mistakeGroups = groupMistakesBySet(filteredMistakes);

  return (
    <div className="lexora-page-enter space-y-5">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-sm font-semibold text-gold">Từ của tôi</p>
          <h1 className="text-[clamp(1.8rem,4vw,2.5rem)] font-extrabold tracking-[-0.045em]">Từ của tôi</h1>
          <p className="mt-2 text-[0.95rem] text-muted">Tra cứu, xem từ đã lưu và từ cần ôn trong một nơi.</p>
        </div>
      </section>

      <div role="tablist" aria-label="Từ của tôi" className="flex gap-1.5 overflow-x-auto rounded-xl border border-line bg-white p-1.5 sm:w-fit">
        {TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold transition ${tab === item.id ? "bg-ink text-white" : "text-muted hover:bg-goldpale/40 hover:text-ink"}`}
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>

      {tab === "lookup" && <DictionarySection />}
      {tab === "saved" && (
        <section aria-labelledby="my-words-saved-title" className={cx.panel}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className={cx.h2}>Đã lưu</h2>
              <p className={cx.desc}>Những từ bạn đã lưu khi học hoặc tra cứu.</p>
            </div>
            {bookmarks && bookmarks.length > 0 && <Link href="/notebook/practice" className={`${cx.btn} ${cx.btnGold} !py-2`}>Luyện từ đã lưu</Link>}
          </div>
          {bookmarks === null ? (
            <div className={cx.empty} role="status">Đang tải danh sách đã lưu...</div>
          ) : bookmarks.length === 0 ? (
            <div className={cx.empty}>
              Chưa có từ nào được lưu. Nhấn ☆ khi tra cứu hoặc học để lưu từ quan trọng.
              <div className="mt-3"><Link className={`${cx.btn} ${cx.btnGold}`} href="/dictionary">Mở tra cứu</Link></div>
            </div>
          ) : (
            <>
              <input
                type="search"
                className={`${cx.input} !mb-3 max-w-md`}
                placeholder="Tìm trong danh sách đã lưu..."
                value={savedQuery}
                onChange={(event) => setSavedQuery(event.target.value)}
              />
              {filteredSaved.length === 0 ? (
                <div className={cx.empty}>Không tìm thấy từ đã lưu phù hợp.</div>
              ) : filteredSaved.map((bookmark) => {
                const answer = bookmark.setType === "irregular_verb" ? `${bookmark.v1} — ${bookmark.v2} — ${bookmark.v3}` : bookmark.term;
                const speakText = bookmark.setType === "irregular_verb" ? bookmark.v1 : bookmark.term;
                return (
                  <article key={bookmark.id} className="mb-3 rounded-[10px] border border-line bg-white p-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 text-[0.7rem] text-muted">{bookmark.setName}</div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-serif text-lg font-bold">{answer}</span>
                          {bookmark.ipa && <span className="text-golddark">{bookmark.ipa}</span>}
                          <SpeakButton text={speakText || ""} />
                        </div>
                        <div className="mt-1 text-[0.9rem]">{bookmark.meaning}</div>
                        {bookmark.example && <div className="mt-1 text-[0.8rem] italic text-muted">VD: {bookmark.example}</div>}
                      </div>
                      <button type="button" disabled={removingId !== null} onClick={() => removeBookmark(bookmark)} className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`}>Bỏ lưu</button>
                    </div>
                  </article>
                );
              })}
            </>
          )}
        </section>
      )}
      {tab === "review" && (
        <section aria-labelledby="my-words-review-title" className={cx.panel}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className={cx.h2}>Cần ôn</h2>
              <p className={cx.desc}>Từ bạn từng làm sai, nhóm theo bộ từ vựng.</p>
            </div>
            {mistakes && mistakes.length > 0 && <Link href="/smart-review" className={`${cx.btn} ${cx.btnGold} !py-2`}>Ôn tập thông minh</Link>}
          </div>
          {mistakes === null ? (
            <div className={cx.empty} role="status">Đang tải danh sách cần ôn...</div>
          ) : mistakeError ? (
            <div className={cx.empty}>
              Không thể tải danh sách cần ôn.
              <div className="mt-3"><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => void loadAll()}>Thử lại</button></div>
            </div>
          ) : mistakes.length === 0 ? (
            <div className={cx.empty}>
              Bạn chưa có từ nào cần ôn lại — làm tốt lắm! 🎉
              <div className="mt-3"><Link className={`${cx.btn} ${cx.btnGold}`} href="/study">Chọn bài để luyện tập</Link></div>
            </div>
          ) : (
            <>
              <input
                type="search"
                className={`${cx.input} !mb-3 max-w-md`}
                placeholder="Tìm từ cần ôn..."
                value={reviewQuery}
                onChange={(event) => setReviewQuery(event.target.value)}
              />
              {filteredMistakes.length === 0 ? (
                <div className={cx.empty}>Không tìm thấy từ cần ôn phù hợp.</div>
              ) : mistakeGroups.map((group) => (
                <section key={group.setId} className="lexora-card mb-4 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-serif text-[1rem]">{group.setName} <span className="text-muted text-[0.8rem] font-sans">— {group.items.length} từ</span></h3>
                    <div className="flex gap-2">
                      <Link className={`${cx.btn} ${cx.btnGold} !px-3 !py-1.5`} href={`/quiz/${group.setId}?mode=fill&retest=1`}>Điền từ</Link>
                      {group.setType === "ielts_vocab" && <Link className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} href={`/quiz/${group.setId}?mode=mc&retest=1`}>Trắc nghiệm</Link>}
                    </div>
                  </div>
                  {group.items.map((row) => (
                    <div key={row.id} className="rounded-[10px] border border-line p-3 mb-2 bg-white">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <button type="button" className="min-w-0 flex-1 text-left" aria-expanded={Boolean(revealed[row.id])} onClick={() => setRevealed((prev) => ({ ...prev, [row.id]: !prev[row.id] }))}>
                          <div className="font-bold">{row.meaning}</div>
                          {!revealed[row.id] && <div className="mt-1 text-[0.78rem] text-muted">Bấm để xem đáp án</div>}
                          {revealed[row.id] && (
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.95rem]">
                              {row.setType === "irregular_verb" ? <span>{row.v1} — {row.v2} — {row.v3}</span> : <span>{row.term}</span>}
                              {row.ipa && <span className="text-golddark">{row.ipa}</span>}
                              <SpeakButton text={row.setType === "irregular_verb" ? row.v1 || "" : row.term || ""} />
                            </div>
                          )}
                        </button>
                        <button type="button" className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} disabled={removingId !== null} onClick={() => markLearned(row.id)}>{removingId === row.id ? "Đang xử lý..." : "✓ Đã thuộc"}</button>
                      </div>
                    </div>
                  ))}
                </section>
              ))}
            </>
          )}
        </section>
      )}
    </div>
  );
}

function DictionarySection() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ id: number; setId: number; setName: string; setType: "irregular_verb" | "ielts_vocab"; meaning: string; term: string | null; v1: string | null; v2: string | null; v3: string | null; ipa: string | null; example: string | null; bookmarkId: number | null }> | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [savingWordId, setSavingWordId] = useState<number | null>(null);

  useEffect(() => {
    const normalized = query.trim();
    if (!normalized) {
      setResults(null);
      setSearching(false);
      setSearchError(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setSearchError(false);
      try {
        const response = await fetch(`/api/dictionary?q=${encodeURIComponent(normalized)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("search failed");
        const data = await response.json();
        setResults(data.results || []);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setResults([]);
          setSearchError(true);
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  async function toggleBookmark(word: { id: number; setType: string; term: string | null; v1: string | null; v2: string | null; v3: string | null; ipa: string | null; example: string | null; meaning: string; setName: string; setId: number; bookmarkId: number | null }) {
    if (savingWordId !== null) return;
    setSavingWordId(word.id);
    try {
      if (word.bookmarkId) {
        const response = await fetch(`/api/bookmarks/${word.bookmarkId}`, { method: "DELETE" });
        if (!response.ok) throw new Error("remove failed");
        setResults((current) => current?.map((item) => item.id === word.id ? { ...item, bookmarkId: null } : item) || current);
        toast("Đã bỏ từ khỏi danh sách đã lưu.");
      } else {
        const response = await fetch("/api/bookmarks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wordId: word.id }),
        });
        if (!response.ok) throw new Error("save failed");
        const data = await response.json();
        setResults((current) => current?.map((item) => item.id === word.id ? { ...item, bookmarkId: data.bookmark.id } : item) || current);
        toast("Đã lưu từ vào danh sách của bạn.");
      }
    } catch {
      toast("Không thể cập nhật sổ tay. Vui lòng thử lại.");
    } finally {
      setSavingWordId(null);
    }
  }

  return (
    <section aria-labelledby="my-words-lookup-title" className={cx.panel}>
      <h2 className={cx.h2}>Tra cứu</h2>
      <div className={cx.desc}>Tìm trên tất cả bộ từ bạn có thể học bằng tiếng Anh, nghĩa tiếng Việt hoặc phiên âm.</div>
      <div className="relative mb-4 max-w-2xl">
        <label className="sr-only" htmlFor="my-words-lookup-input">Từ cần tra cứu</label>
        <input
          id="my-words-lookup-input"
          type="search"
          autoFocus
          className={`${cx.input} !mb-0 !py-3 !pr-24`}
          placeholder="Ví dụ: environment, môi trường, /ɪnˈvaɪrənmənt/..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted" aria-live="polite">
          {searching ? "Đang tìm..." : results ? `${results.length} kết quả` : ""}
        </div>
      </div>
      {searchError ? (
        <div className={cx.empty}>Không thể tra cứu lúc này.<div className="mt-3"><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => { const value = query; setQuery(""); window.setTimeout(() => setQuery(value), 0); }}>Thử lại</button></div></div>
      ) : results === null ? (
        <div className={cx.empty}>Nhập từ hoặc nghĩa cần tìm. Kết quả sẽ xuất hiện tự động.</div>
      ) : results.length === 0 && !searching ? (
        <div className={cx.empty}>Không tìm thấy từ phù hợp.</div>
      ) : (
        <div aria-live="polite" aria-busy={searching}>
          {results.map((word) => {
            const answer = word.setType === "irregular_verb" ? `${word.v1} — ${word.v2} — ${word.v3}` : word.term;
            const speakText = word.setType === "irregular_verb" ? word.v1 : word.term;
            return (
              <article key={word.id} className="mb-3 rounded-[10px] border border-line bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 text-xs text-muted">{word.setName}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-serif text-lg font-bold">{answer}</span>
                      {word.ipa && <span className="text-golddark">{word.ipa}</span>}
                      <SpeakButton text={speakText || ""} />
                    </div>
                    <div className="mt-1 text-sm">{word.meaning}</div>
                    {word.example && <div className="mt-1 text-xs italic text-muted">VD: {word.example}</div>}
                  </div>
                  <button type="button" className={`${cx.btn} ${word.bookmarkId ? cx.btnGold : cx.btnGhost} !px-3 !py-1.5 shrink-0`} disabled={savingWordId !== null} aria-label={word.bookmarkId ? "Bỏ khỏi danh sách đã lưu" : "Lưu từ"} onClick={() => void toggleBookmark(word)}>
                    {savingWordId === word.id ? "…" : word.bookmarkId ? "★ Đã lưu" : "☆ Lưu"}
                  </button>
                </div>
                <div className="mt-3"><Link className="text-xs font-medium text-golddark hover:underline" href={`/learn/${word.setId}`}>Mở bộ từ →</Link></div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
