"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cx } from "@/components/ui";
import SpeakButton from "@/components/SpeakButton";
import { toast } from "@/components/Toast";

type SearchResult = {
  id: number;
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
  bookmarkId: number | null;
};

export default function DictionaryPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [savingWordId, setSavingWordId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  async function toggleBookmark(word: SearchResult) {
    if (savingWordId !== null) return;
    setSavingWordId(word.id);
    try {
      if (word.bookmarkId) {
        const response = await fetch(`/api/bookmarks/${word.bookmarkId}`, { method: "DELETE" });
        if (!response.ok) throw new Error("remove failed");
        setResults((current) => current?.map((item) => item.id === word.id ? { ...item, bookmarkId: null } : item) || current);
        toast("Đã bỏ từ khỏi sổ tay.");
      } else {
        const response = await fetch("/api/bookmarks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wordId: word.id }),
        });
        if (!response.ok) throw new Error("save failed");
        const data = await response.json();
        setResults((current) => current?.map((item) => item.id === word.id ? { ...item, bookmarkId: data.bookmark.id } : item) || current);
        toast("Đã lưu từ vào sổ tay.");
      }
    } catch {
      toast("Không thể cập nhật sổ tay. Vui lòng thử lại.");
    } finally {
      setSavingWordId(null);
    }
  }

  return (
    <div className={cx.panel}>
      <h2 className={cx.h2}>Tra cứu từ vựng</h2>
      <div className={cx.desc}>Tìm trên tất cả bộ từ bạn có thể học bằng tiếng Anh, nghĩa tiếng Việt, phiên âm hoặc tên bộ từ.</div>

      <div className="relative mb-4 max-w-2xl">
        <label className="sr-only" htmlFor="dictionary-search">Từ cần tra cứu</label>
        <input
          ref={inputRef}
          id="dictionary-search"
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
        <div className={cx.empty}>Không tìm thấy từ phù hợp.<div className="mt-3"><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => { setQuery(""); inputRef.current?.focus(); }}>Xoá tìm kiếm</button></div></div>
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
                  <button
                    type="button"
                    className={`${cx.btn} ${word.bookmarkId ? cx.btnGold : cx.btnGhost} !px-3 !py-1.5 shrink-0`}
                    disabled={savingWordId !== null}
                    aria-label={word.bookmarkId ? "Bỏ khỏi sổ tay" : "Lưu vào sổ tay"}
                    onClick={() => void toggleBookmark(word)}
                  >
                    {savingWordId === word.id ? "…" : word.bookmarkId ? "★ Đã lưu" : "☆ Lưu"}
                  </button>
                </div>
                <div className="mt-3"><Link className="text-xs font-medium text-golddark hover:underline" href={`/learn/${word.setId}`}>Mở bộ từ →</Link></div>
              </article>
            );
          })}
          {results.length === 50 && <div className="py-2 text-center text-xs text-muted">Đang hiển thị 50 kết quả đầu tiên. Hãy nhập cụ thể hơn để thu hẹp.</div>}
        </div>
      )}
    </div>
  );
}
