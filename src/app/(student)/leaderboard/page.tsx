"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/ui";

type Row = {
  userId: number;
  username: string;
  displayName: string;
  attemptCount: number;
  totalScore: number;
  totalQuestions: number;
  accuracy: number;
};

export default function LeaderboardPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [me, setMe] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then((d) => {
        setRows(d.leaderboard || []);
        setMe(d.me);
      });
  }, []);

  const medal = (i: number) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`);

  return (
    <div className={cx.panel}>
      <h2 className={cx.h2}>Bảng xếp hạng</h2>
      <div className={cx.desc}>Xếp hạng theo độ chính xác trung bình trên tất cả các lượt làm bài.</div>

      {rows === null ? (
        <div className={cx.empty}>Đang tải...</div>
      ) : rows.length === 0 ? (
        <div className={cx.empty}>Chưa có ai làm bài để xếp hạng.</div>
      ) : (
        <table className={cx.table}>
          <thead>
            <tr>
              <th className={cx.th}>#</th>
              <th className={cx.th}>Học sinh</th>
              <th className={cx.th}>Độ chính xác</th>
              <th className={cx.th}>Số lượt làm bài</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.userId} className={r.userId === me ? "bg-goldpale/50" : ""}>
                <td className={cx.td}>{medal(i)}</td>
                <td className={cx.td}>
                  {r.displayName} {r.userId === me && <span className={cx.badgeGold}>Bạn</span>}
                </td>
                <td className={cx.td}>
                  <b>{r.accuracy}%</b>{" "}
                  <span className="text-muted text-[0.78rem]">
                    ({r.totalScore}/{r.totalQuestions})
                  </span>
                </td>
                <td className={cx.td}>{r.attemptCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
