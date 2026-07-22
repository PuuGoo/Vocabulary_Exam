"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cx } from "@/components/ui";
import { toast } from "@/components/Toast";
import SpeakButton from "@/components/SpeakButton";
import { groupMistakesBySet, type MistakeRow } from "@/lib/reviewGroups";

export default function ReviewPage() {
  const [rows, setRows] = useState<MistakeRow[] | null>(null);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [removingId, setRemovingId] = useState<number | null>(null);

  async function load() {
    setRows(null);
    setLoadError(false);
    try {
      const res = await fetch("/api/mistakes");
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      setRows(data.mistakes || []);
    } catch {
      setRows([]);
      setLoadError(true);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function markLearned(id: number) {
    if (removingId !== null) return;
    setRemovingId(id);
    try {
      const res = await fetch(`/api/mistakes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      toast("Đã đánh dấu là thuộc và bỏ khỏi danh sách ôn tập.");
      setRows((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
    } catch {
      toast("Không thể cập nhật từ này. Vui lòng thử lại.");
    } finally {
      setRemovingId(null);
    }
  }

  const filteredRows = useMemo(() => {
    if (!rows) return [];
    const query = searchQuery.trim().toLocaleLowerCase("vi");
    if (!query) return rows;
    return rows.filter((row) =>
      `${row.setName} ${row.meaning} ${row.term || ""} ${row.v1 || ""} ${row.v2 || ""} ${row.v3 || ""}`
        .toLocaleLowerCase("vi")
        .includes(query)
    );
  }, [rows, searchQuery]);
  const groups = groupMistakesBySet(filteredRows);

  return (
    <div className={cx.panel}>
      <h2 className={cx.h2}>Ôn từ sai</h2>
      <div className={cx.desc}>
        Danh sách các từ bạn từng làm sai, nhóm theo từng bộ từ vựng. Bấm vào thẻ để xem đáp án, đánh dấu
        &quot;Đã thuộc&quot; để bỏ khỏi danh sách, hoặc làm lại bài kiểm tra chỉ với các từ đang sai của một bộ.
      </div>

      {rows !== null && rows.length > 0 && (
        <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
          <input
            type="search"
            className={`${cx.input} !mb-0 max-w-md`}
            placeholder="Tìm từ, nghĩa hoặc bộ từ..."
            aria-label="Tìm trong danh sách ôn từ sai"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="text-[0.8rem] text-muted">{filteredRows.length}/{rows.length} từ</div>
        </div>
      )}

      {rows === null ? (
        <div className={cx.empty} role="status">Đang tải danh sách ôn tập...</div>
      ) : loadError ? (
        <div className={cx.empty}>
          Không thể tải danh sách ôn tập.
          <div className="mt-3"><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => void load()}>Thử lại</button></div>
        </div>
      ) : rows.length === 0 ? (
        <div className={cx.empty}>
          Bạn chưa có từ nào cần ôn lại — làm tốt lắm! 🎉
          <div className="mt-3"><Link className={`${cx.btn} ${cx.btnGold}`} href="/study">Chọn bài để luyện tập</Link></div>
        </div>
      ) : groups.length === 0 ? (
        <div className={cx.empty}>
          Không tìm thấy từ phù hợp.
          <div className="mt-3"><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => setSearchQuery("")}>Xoá tìm kiếm</button></div>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.setId} className="lexora-card mb-5 p-4 sm:p-5">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
              <h3 className="font-serif text-[1rem]">
                {g.setName} <span className="text-muted text-[0.8rem] font-sans">— {g.items.length} từ sai</span>
              </h3>
              <div className="flex gap-2 flex-wrap">
                <Link className={`${cx.btn} ${cx.btnGold} !px-3 !py-1.5`} href={`/quiz/${g.setId}?mode=fill&retest=1`}>
                  Làm lại (Điền từ)
                </Link>
                {g.setType === "ielts_vocab" && (
                  <Link className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} href={`/quiz/${g.setId}?mode=mc&retest=1`}>
                    Làm lại (Trắc nghiệm)
                  </Link>
                )}
                <Link className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} href={`/dictation/${g.setId}`}>
                  Nghe và viết
                </Link>
              </div>
            </div>

            {g.items.map((r) => (
              <div key={r.id} className="border border-line rounded-[10px] p-4 mb-3 bg-white">
                <div className="flex justify-between items-start gap-3 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <div className="text-[0.72rem] text-muted mb-1">Sai {r.timesWrong} lần</div>
                    <button
                      type="button"
                      aria-expanded={Boolean(revealed[r.id])}
                      className="block w-full text-left"
                      onClick={() => setRevealed((prev) => ({ ...prev, [r.id]: !prev[r.id] }))}
                    >
                      <div className="font-bold">{r.meaning}</div>
                      {!revealed[r.id] && <div className="text-muted text-[0.8rem] mt-1">Bấm để xem đáp án</div>}
                    </button>
                    {revealed[r.id] && (
                        <div className="mt-1.5 flex items-center gap-2 text-[0.95rem] flex-wrap" role="region" aria-label={`Đáp án của ${r.meaning}`}>
                          {r.setType === "irregular_verb" ? (
                            <span>
                              {r.v1} — {r.v2} — {r.v3}
                            </span>
                          ) : (
                            <span>{r.term}</span>
                          )}
                          {r.ipa && <span className="text-golddark">{r.ipa}</span>}
                          <SpeakButton text={(r.setType === "irregular_verb" ? r.v1 : r.term) || ""} />
                        </div>
                    )}
                  </div>
                  <button
                    className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`}
                    disabled={removingId !== null}
                    onClick={() => markLearned(r.id)}
                  >
                    {removingId === r.id ? "Đang cập nhật..." : "✓ Đã thuộc"}
                  </button>
                </div>
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
