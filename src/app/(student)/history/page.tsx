"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/ui";

type ResultRow = {
  id: number;
  setName: string;
  mode: "fill" | "mc";
  score: number;
  total: number;
  createdAt: string;
};

export default function HistoryPage() {
  const [rows, setRows] = useState<ResultRow[] | null>(null);

  useEffect(() => {
    fetch("/api/results")
      .then((r) => r.json())
      .then((d) => setRows(d.results || []));
  }, []);

  return (
    <div className={cx.panel}>
      <h2 className={cx.h2}>Lịch sử làm bài của bạn</h2>

      {rows === null ? (
        <div className={cx.empty}>Đang tải...</div>
      ) : rows.length === 0 ? (
        <div className={cx.empty}>Bạn chưa làm bài kiểm tra nào.</div>
      ) : (
        <table className={cx.table}>
          <thead>
            <tr>
              <th className={cx.th}>Bộ từ</th>
              <th className={cx.th}>Chế độ</th>
              <th className={cx.th}>Điểm</th>
              <th className={cx.th}>Thời gian</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className={cx.td}>{r.setName}</td>
                <td className={cx.td}>{r.mode === "mc" ? "Trắc nghiệm" : "Tự luận"}</td>
                <td className={cx.td}>
                  <b>
                    {r.score}/{r.total}
                  </b>{" "}
                  ({Math.round((r.score / r.total) * 100)}%)
                </td>
                <td className={cx.td}>{new Date(r.createdAt).toLocaleString("vi-VN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
