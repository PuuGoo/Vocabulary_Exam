"use client";

import { useEffect, useState } from "react";
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
  username: string;
  displayName: string;
};

export default function AdminResultsPage() {
  const [rows, setRows] = useState<ResultRow[] | null>(null);

  useEffect(() => {
    fetch("/api/admin/results")
      .then((r) => r.json())
      .then((d) => setRows(d.results || []));
  }, []);

  async function exportExcel() {
    if (!rows || rows.length === 0) return;
    const XLSX = await import("xlsx");
    const data = rows.map((r) => ({
      "Học sinh": r.displayName || r.username,
      "Tên đăng nhập": r.username,
      "Bộ từ": r.setName,
      "Chế độ": r.mode === "daily" ? "Thử thách hằng ngày" : r.mode === "mixed" ? "Kiểm tra tổng hợp" : r.mode === "sentence" ? "Xếp câu" : r.mode === "pronunciation" ? "Luyện phát âm" : r.mode === "dictation" ? "Nghe & viết" : r.mode === "match" ? "Ghép cặp" : r.mode === "mc" ? "Trắc nghiệm" : "Tự luận",
      "Thi có tính giờ": r.timed ? "Có" : "Không",
      "Thời gian làm bài (giây)": r.durationSeconds ?? "",
      "Điểm": r.score,
      "Tổng số câu": r.total,
      "Tỷ lệ đúng (%)": Math.round((r.score / r.total) * 1000) / 10,
      "Thời điểm": new Date(r.createdAt).toLocaleString("vi-VN"),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ket qua");
    XLSX.writeFile(wb, `ket-qua-hoc-sinh-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function exportPdf() {
    window.print();
  }

  return (
    <div className={cx.panel} id="admin-results-panel">
      <div className="flex justify-between items-start flex-wrap gap-3 mb-1 print:hidden">
        <div>
          <h2 className={cx.h2}>Kết quả làm bài của học sinh</h2>
          <div className={cx.desc}>Tổng hợp toàn bộ lượt kiểm tra từ vựng của học sinh.</div>
        </div>
        <div className="flex gap-2.5">
          <button className={`${cx.btn} ${cx.btnGold}`} onClick={exportExcel} disabled={!rows || rows.length === 0}>
            📊 Xuất Excel
          </button>
          <button className={`${cx.btn} ${cx.btnGhost}`} onClick={exportPdf} disabled={!rows || rows.length === 0}>
            🖨️ In / Xuất PDF
          </button>
        </div>
      </div>

      <h2 className="hidden print:block font-serif text-lg mb-3">Kết quả làm bài của học sinh</h2>

      {rows === null ? (
        <div className={cx.empty}>Đang tải...</div>
      ) : rows.length === 0 ? (
        <div className={cx.empty}>Chưa có học sinh nào làm bài.</div>
      ) : (
        <table className={cx.table}>
          <thead>
            <tr>
              <th className={cx.th}>Học sinh</th>
              <th className={cx.th}>Bộ từ</th>
              <th className={cx.th}>Chế độ</th>
              <th className={cx.th}>Điểm</th>
              <th className={cx.th}>Thời gian làm bài</th>
              <th className={cx.th}>Thời điểm</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className={cx.td}>{r.displayName || r.username}</td>
                <td className={cx.td}>{r.setName}</td>
                <td className={cx.td}>
                  {r.mode === "daily" ? "Thử thách hằng ngày" : r.mode === "mixed" ? "Kiểm tra tổng hợp" : r.mode === "sentence" ? "Xếp câu" : r.mode === "pronunciation" ? "Luyện phát âm" : r.mode === "dictation" ? "Nghe & viết" : r.mode === "match" ? "Ghép cặp" : r.mode === "mc" ? "Trắc nghiệm" : "Tự luận"}
                  {r.timed && <span className={`${cx.badgeGold} ml-1.5`}>Tính giờ</span>}
                </td>
                <td className={cx.td}>
                  <b>
                    {r.score}/{r.total}
                  </b>{" "}
                  ({Math.round((r.score / r.total) * 100)}%)
                </td>
                <td className={cx.td}>{r.durationSeconds ? `${Math.floor(r.durationSeconds / 60)}p ${r.durationSeconds % 60}s` : "—"}</td>
                <td className={cx.td}>{new Date(r.createdAt).toLocaleString("vi-VN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
