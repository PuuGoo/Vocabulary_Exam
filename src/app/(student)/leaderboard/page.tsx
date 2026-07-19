"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/ui";

type Period = "week" | "30d" | "all";
type Row = {
  userId: number;
  username: string;
  displayName: string;
  role: string;
  attemptCount: number;
  totalScore: number;
  totalQuestions: number;
  accuracy: number;
  xp: number;
  rank: number;
};
type Data = { leaderboard: Row[]; me: number; mine: Row | null; participantCount: number; periodStart: string | null };

const PERIODS: Array<{ id: Period; label: string }> = [
  { id: "week", label: "Tuần này" },
  { id: "30d", label: "30 ngày" },
  { id: "all", label: "Toàn thời gian" },
];

function rankLabel(rank: number) {
  return rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;
}

export default function LeaderboardPage() {
  const [period, setPeriod] = useState<Period>("week");
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setData(null);
    setLoadError(false);
    fetch(`/api/leaderboard?period=${period}`)
      .then(async (res) => { if (!res.ok) throw new Error("load failed"); return res.json(); })
      .then((result) => { if (active) setData(result); })
      .catch(() => { if (active) { setLoadError(true); setData({ leaderboard: [], me: 0, mine: null, participantCount: 0, periodStart: null }); } });
    return () => { active = false; };
  }, [loadAttempt, period]);

  return (
    <div className={cx.panel}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className={cx.h2}>🏆 Bảng xếp hạng</h2><div className={cx.desc}>Xếp hạng bằng XP: mỗi câu đúng được 10 XP và mỗi lượt hoàn thành được thêm 5 XP.</div></div>
        <div className="flex rounded-lg border border-line bg-white p-1" aria-label="Khoảng thời gian xếp hạng">
          {PERIODS.map((item) => <button key={item.id} className={`rounded-md px-3 py-1.5 text-xs font-medium ${period === item.id ? "bg-ink text-white" : "text-muted hover:text-ink"}`} aria-pressed={period === item.id} onClick={() => setPeriod(item.id)}>{item.label}</button>)}
        </div>
      </div>

      {data?.mine && (
        <section className="mb-5 rounded-xl border border-gold bg-goldpale/40 p-4" aria-label="Thứ hạng của bạn">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><div className="text-xs font-medium uppercase tracking-wide text-golddark">Thứ hạng của bạn</div><div className="mt-1 flex items-baseline gap-2"><b className="font-serif text-2xl">{rankLabel(data.mine.rank)}</b><span className="text-sm text-muted">trên {data.participantCount} người học</span></div></div>
            <div className="flex gap-5 text-center"><div><b className="block text-xl text-golddark">{data.mine.xp}</b><span className="text-xs text-muted">XP</span></div><div><b className="block text-xl">{data.mine.accuracy}%</b><span className="text-xs text-muted">chính xác</span></div><div><b className="block text-xl">{data.mine.attemptCount}</b><span className="text-xs text-muted">lượt học</span></div></div>
          </div>
        </section>
      )}

      {data && data.leaderboard.length >= 3 && (
        <section className="mb-5 grid gap-3 sm:grid-cols-3" aria-label="Ba người dẫn đầu">
          {[data.leaderboard[1], data.leaderboard[0], data.leaderboard[2]].map((row, visualIndex) => (
            <article key={row.userId} className={`rounded-xl border p-4 text-center ${row.userId === data.me ? "border-gold bg-goldpale/40" : visualIndex === 1 ? "border-gold bg-white shadow-sm" : "border-line bg-white"} ${visualIndex === 1 ? "sm:-translate-y-1" : ""}`}>
              <div className="text-3xl">{rankLabel(row.rank)}</div><div className="mt-2 truncate font-semibold">{row.displayName}</div><div className="mt-1 text-lg font-bold text-golddark">{row.xp} XP</div><div className="text-xs text-muted">{row.accuracy}% đúng · {row.attemptCount} lượt</div>{row.role === "admin" && <span className={`${cx.badgeGold} mt-2`}>Admin · Học viên</span>}
            </article>
          ))}
        </section>
      )}

      {data === null ? (
        <div className={cx.empty} role="status">Đang cập nhật bảng xếp hạng...</div>
      ) : loadError ? (
        <div className={cx.empty}>Không thể tải bảng xếp hạng.<div className="mt-3"><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => setLoadAttempt((value) => value + 1)}>Thử lại</button></div></div>
      ) : data.leaderboard.length === 0 ? (
        <div className={cx.empty}>Chưa có lượt làm bài nào trong khoảng thời gian này.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className={`${cx.table} min-w-[640px] bg-white`}>
            <thead><tr><th className={cx.th}>Hạng</th><th className={cx.th}>Người học</th><th className={cx.th}>XP</th><th className={cx.th}>Chính xác</th><th className={cx.th}>Hoạt động</th></tr></thead>
            <tbody>{data.leaderboard.map((row) => <tr key={row.userId} className={row.userId === data.me ? "bg-goldpale/50" : ""}><td className={`${cx.td} font-semibold`}>{rankLabel(row.rank)}</td><td className={cx.td}><div className="font-medium">{row.displayName} {row.userId === data.me && <span className={cx.badgeGold}>Bạn</span>}</div><div className="text-xs text-muted">@{row.username}{row.role === "admin" ? " · Admin" : ""}</div></td><td className={cx.td}><b className="text-golddark">{row.xp}</b></td><td className={cx.td}><b>{row.accuracy}%</b><div className="text-xs text-muted">{row.totalScore}/{row.totalQuestions} câu</div></td><td className={cx.td}>{row.attemptCount} lượt</td></tr>)}</tbody>
          </table>
          {data.participantCount > data.leaderboard.length && <div className="border-t border-line bg-white p-3 text-center text-xs text-muted">Đang hiển thị top {data.leaderboard.length}/{data.participantCount} người học.</div>}
        </div>
      )}
    </div>
  );
}
