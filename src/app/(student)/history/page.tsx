"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cx } from "@/components/ui";

type ResultRow = {
  id: number;
  setName: string;
  mode: "fill" | "mc" | "match" | "dictation" | "pronunciation" | "sentence" | "mixed" | "daily";
  score: number;
  total: number;
  timed: boolean;
  durationSeconds: number | null;
  createdAt: string;
};

function percentage(row: ResultRow) {
  return row.total > 0 ? Math.round((row.score / row.total) * 100) : 0;
}

function formatDuration(seconds: number | null) {
  if (seconds == null) return "—";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export default function HistoryPage() {
  const [rows, setRows] = useState<ResultRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  async function load() {
    setRows(null);
    setLoadError(false);
    try {
      const res = await fetch("/api/results");
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      setRows(data.results || []);
    } catch {
      setRows([]);
      setLoadError(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredRows = useMemo(() => {
    if (!rows) return [];
    const query = searchQuery.trim().toLocaleLowerCase("vi");
    if (!query) return rows;
    return rows.filter((row) => row.setName.toLocaleLowerCase("vi").includes(query));
  }, [rows, searchQuery]);

  const average = rows?.length ? Math.round(rows.reduce((sum, row) => sum + percentage(row), 0) / rows.length) : 0;
  const best = rows?.length ? Math.max(...rows.map(percentage)) : 0;

  return (
    <div className={cx.panel}>
      <h2 className={cx.h2}>Lịch sử làm bài của bạn</h2>

      {rows !== null && rows.length > 0 && (
        <>
          <div className="my-4 grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-lg border border-line bg-white p-3 text-center">
              <div className="font-serif text-xl font-bold">{rows.length}</div>
              <div className="text-[0.72rem] text-muted">Lượt làm bài</div>
            </div>
            <div className="rounded-lg border border-line bg-white p-3 text-center">
              <div className="font-serif text-xl font-bold">{average}%</div>
              <div className="text-[0.72rem] text-muted">Điểm trung bình</div>
            </div>
            <div className="rounded-lg border border-line bg-white p-3 text-center">
              <div className="font-serif text-xl font-bold text-ok">{best}%</div>
              <div className="text-[0.72rem] text-muted">Cao nhất</div>
            </div>
          </div>
          <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
            <input
              type="search"
              className={`${cx.input} !mb-0 max-w-md`}
              placeholder="Tìm theo tên bộ từ..."
              aria-label="Tìm trong lịch sử làm bài"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="text-[0.8rem] text-muted">{filteredRows.length}/{rows.length} kết quả</div>
          </div>
        </>
      )}

      {rows === null ? (
        <div className={cx.empty} role="status">Đang tải lịch sử...</div>
      ) : loadError ? (
        <div className={cx.empty}>
          Không thể tải lịch sử làm bài.
          <div className="mt-3"><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => void load()}>Thử lại</button></div>
        </div>
      ) : rows.length === 0 ? (
        <div className={cx.empty}>
          Bạn chưa làm bài kiểm tra nào.
          <div className="mt-3"><Link className={`${cx.btn} ${cx.btnGold}`} href="/study">Bắt đầu luyện tập</Link></div>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className={cx.empty}>
          Không tìm thấy kết quả phù hợp.
          <div className="mt-3"><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => setSearchQuery("")}>Xoá tìm kiếm</button></div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
        <table className={cx.table}>
          <thead>
            <tr>
              <th className={cx.th}>Bộ từ</th>
              <th className={cx.th}>Chế độ</th>
              <th className={cx.th}>Điểm</th>
              <th className={cx.th}>Thời lượng</th>
              <th className={cx.th}>Thời gian</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((r) => (
              <tr key={r.id} className="hover:bg-goldpale/30">
                <td className={cx.td}>{r.setName}</td>
                <td className={`${cx.td} whitespace-nowrap`}>{r.timed ? "Thi thử" : r.mode === "daily" ? "Thử thách hằng ngày" : r.mode === "mixed" ? "Kiểm tra tổng hợp" : r.mode === "sentence" ? "Xếp câu" : r.mode === "pronunciation" ? "Luyện phát âm" : r.mode === "dictation" ? "Nghe & viết" : r.mode === "match" ? "Ghép cặp" : r.mode === "mc" ? "Trắc nghiệm" : "Điền từ"}</td>
                <td className={cx.td}>
                  <b>
                    {r.score}/{r.total}
                  </b>{" "}
                  ({percentage(r)}%)
                </td>
                <td className={`${cx.td} whitespace-nowrap`}>{formatDuration(r.durationSeconds)}</td>
                <td className={`${cx.td} whitespace-nowrap`}>{new Date(r.createdAt).toLocaleString("vi-VN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
