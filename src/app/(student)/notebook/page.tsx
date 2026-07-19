"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cx } from "@/components/ui";
import SpeakButton from "@/components/SpeakButton";
import { toast } from "@/components/Toast";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";

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

export default function NotebookPage() {
  const [bookmarks, setBookmarks] = useState<Bookmark[] | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);

  async function load() {
    setBookmarks(null);
    setLoadError(false);
    try {
      const res = await fetch("/api/bookmarks");
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      const rows: Bookmark[] = data.bookmarks || [];
      setBookmarks(rows);
      setNotes(Object.fromEntries(rows.map((row) => [row.id, row.note])));
    } catch {
      setBookmarks([]);
      setLoadError(true);
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    if (!bookmarks) return [];
    const query = searchQuery.trim().toLocaleLowerCase("vi");
    if (!query) return bookmarks;
    return bookmarks.filter((row) =>
      `${row.setName} ${row.meaning} ${row.term || ""} ${row.v1 || ""} ${row.v2 || ""} ${row.v3 || ""} ${notes[row.id] || ""}`
        .toLocaleLowerCase("vi")
        .includes(query)
    );
  }, [bookmarks, notes, searchQuery]);
  const hasUnsavedNotes = Boolean(bookmarks?.some((row) => (notes[row.id] || "") !== row.note));
  useUnsavedChangesWarning(hasUnsavedNotes, "Bạn có ghi chú chưa lưu. Rời trang sẽ làm mất những thay đổi này. Bạn vẫn muốn rời đi?");

  async function saveNote(bookmark: Bookmark) {
    if (savingId !== null) return;
    setSavingId(bookmark.id);
    try {
      const res = await fetch(`/api/bookmarks/${bookmark.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: notes[bookmark.id] || "" }),
      });
      if (!res.ok) throw new Error("save failed");
      const data = await res.json();
      setBookmarks((current) => current?.map((row) => row.id === bookmark.id ? { ...row, note: data.bookmark.note } : row) || current);
      setNotes((current) => ({ ...current, [bookmark.id]: data.bookmark.note }));
      toast("Đã lưu ghi chú.");
    } catch {
      toast("Không thể lưu ghi chú. Vui lòng thử lại.");
    } finally {
      setSavingId(null);
    }
  }

  async function remove(bookmark: Bookmark) {
    if (!confirm(`Bỏ “${bookmark.term || bookmark.v1 || bookmark.meaning}” khỏi sổ tay?`)) return;
    setRemovingId(bookmark.id);
    try {
      const res = await fetch(`/api/bookmarks/${bookmark.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      setBookmarks((current) => current?.filter((row) => row.id !== bookmark.id) || current);
      toast("Đã bỏ từ khỏi sổ tay.");
    } catch {
      toast("Không thể bỏ từ khỏi sổ tay.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className={cx.panel}>
      <h2 className={cx.h2}>Sổ tay từ vựng</h2>
      <div className={cx.desc}>Lưu những từ quan trọng và viết ghi chú theo cách bạn dễ nhớ nhất.</div>

      {bookmarks !== null && bookmarks.length > 0 && (
        <div className="mb-4 rounded-xl border border-gold/40 bg-gold/5 p-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-semibold">📖 Luyện riêng từ đã lưu</div>
            <div className="mt-1 text-xs text-muted">Biến {bookmarks.length} từ trong sổ tay thành một lượt flashcard cá nhân.</div>
          </div>
          <Link className={`${cx.btn} ${cx.btnGold}`} href="/notebook/practice">Bắt đầu luyện</Link>
        </div>
      )}

      {bookmarks !== null && bookmarks.length > 0 && (
        <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
          <input type="search" className={`${cx.input} !mb-0 max-w-md`} placeholder="Tìm từ, nghĩa, ghi chú hoặc bộ từ..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} aria-label="Tìm trong sổ tay" />
          <div className="text-[0.8rem] text-muted">{filtered.length}/{bookmarks.length} từ đã lưu</div>
        </div>
      )}

      {bookmarks === null ? (
        <div className={cx.empty} role="status">Đang mở sổ tay...</div>
      ) : loadError ? (
        <div className={cx.empty}>Không thể tải sổ tay.<div className="mt-3"><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => void load()}>Thử lại</button></div></div>
      ) : bookmarks.length === 0 ? (
        <div className={cx.empty}>Sổ tay đang trống. Khi học bài, nhấn ☆ để lưu từ bạn quan tâm.<div className="mt-3"><Link className={`${cx.btn} ${cx.btnGold}`} href="/study">Chọn bộ từ để học</Link></div></div>
      ) : filtered.length === 0 ? (
        <div className={cx.empty}>Không tìm thấy từ phù hợp.<div className="mt-3"><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => setSearchQuery("")}>Xoá tìm kiếm</button></div></div>
      ) : filtered.map((bookmark) => {
        const answer = bookmark.setType === "irregular_verb" ? `${bookmark.v1} — ${bookmark.v2} — ${bookmark.v3}` : bookmark.term;
        const speakText = bookmark.setType === "irregular_verb" ? bookmark.v1 : bookmark.term;
        const changed = (notes[bookmark.id] || "") !== bookmark.note;
        return (
          <article key={bookmark.id} className="mb-3 rounded-[10px] border border-line bg-white p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="mb-1 text-[0.7rem] text-muted">{bookmark.setName}</div>
                <div className="flex items-center gap-2 flex-wrap"><span className="font-serif text-lg font-bold">{answer}</span>{bookmark.ipa && <span className="text-golddark">{bookmark.ipa}</span>}<SpeakButton text={speakText || ""} /></div>
                <div className="mt-1 text-[0.9rem]">{bookmark.meaning}</div>
                {bookmark.example && <div className="mt-1 text-[0.8rem] italic text-muted">VD: {bookmark.example}</div>}
              </div>
              <Link href={`/learn/${bookmark.setId}`} className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`}>Mở bộ từ</Link>
            </div>
            <label className={`${cx.label} mt-3`} htmlFor={`note-${bookmark.id}`}>Ghi chú cá nhân</label>
            <textarea id={`note-${bookmark.id}`} className={`${cx.input} min-h-20 resize-y`} maxLength={2000} placeholder="VD: Cách liên tưởng, câu ví dụ của riêng bạn..." value={notes[bookmark.id] || ""} onChange={(event) => setNotes((current) => ({ ...current, [bookmark.id]: event.target.value }))} />
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-[0.72rem] text-muted">{(notes[bookmark.id] || "").length}/2000 ký tự{changed && <span className="ml-2 text-golddark">● Chưa lưu</span>}</div>
              <div className="flex gap-2">
                <button className={`${cx.btn} ${cx.btnGold} !px-3 !py-1.5`} disabled={!changed || savingId !== null} onClick={() => saveNote(bookmark)}>{savingId === bookmark.id ? "Đang lưu..." : "Lưu ghi chú"}</button>
                <button className="px-2 py-1.5 text-[0.8rem] text-bad hover:underline disabled:opacity-50" disabled={removingId !== null} onClick={() => remove(bookmark)}>{removingId === bookmark.id ? "Đang bỏ..." : "Bỏ khỏi sổ"}</button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
