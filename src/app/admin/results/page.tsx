"use client";

import { useEffect, useMemo, useState } from "react";
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

const PAGE_SIZE = 50;
const MODE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "Mọi chế độ" },
  { value: "fill", label: "Điền từ" },
  { value: "mc", label: "Trắc nghiệm" },
  { value: "match", label: "Ghép cặp" },
  { value: "dictation", label: "Nghe & viết" },
  { value: "pronunciation", label: "Luyện phát âm" },
  { value: "sentence", label: "Xếp câu" },
  { value: "mixed", label: "Kiểm tra tổng hợp" },
  { value: "daily", label: "Thử thách hằng ngày" },
];

function modeLabel(r: Pick<ResultRow, "mode" | "timed">) {
  return r.mode === "daily" ? "Thử thách hằng ngày" : r.mode === "mixed" ? "Kiểm tra tổng hợp" : r.mode === "sentence" ? "Xếp câu" : r.mode === "pronunciation" ? "Luyện phát âm" : r.mode === "dictation" ? "Nghe & viết" : r.mode === "match" ? "Ghép cặp" : r.mode === "mc" ? "Trắc nghiệm" : "Điền từ";
}

export default function AdminResultsPage() {
  const [rows, setRows] = useState<ResultRow[] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [studentFilter, setStudentFilter] = useState("");
  const [modeFilter, setModeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    fetch("/api/admin/results")
      .then((r) => r.json())
      .then((d) => setRows(d.results || []));
  }, []);

  useEffect(() => { setPage(0); }, [searchQuery, studentFilter, modeFilter, dateFrom, dateTo]);

  const students = useMemo(() => {
    const map = new Map<string, string>();
    (rows || []).forEach((r) => map.set(r.username, r.displayName || r.username));
    return Array.from(map.entries()).map(([username, name]) => ({ username, name })).sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase("vi");
    const from = dateFrom ? new Date(dateFrom + "T00:00:00").getTime() : null;
    const to = dateTo ? new Date(dateTo + "T23:59:59").getTime() : null;
    return (rows || []).filter((r) => {
      if (q && !`${r.displayName} ${r.username} ${r.setName}`.toLocaleLowerCase("vi").includes(q)) return false;
      if (studentFilter && r.username !== studentFilter) return false;
      if (modeFilter !== "all" && r.mode !== modeFilter) return false;
      const t = new Date(r.createdAt).getTime();
      if (from && t < from) return false;
      if (to && t > to) return false;
      return true;
    });
  }, [dateFrom, dateTo, modeFilter, rows, searchQuery, studentFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const totalAttempts = rows?.length || 0;
  const filteredAttempts = filtered.length;
  const avgAccuracy = filtered.length ? Math.round(filtered.reduce((sum, r) => sum + (r.total ? r.score / r.total : 0), 0) / filtered.length * 100) : null;
  const uniqueStudents = new Set(filtered.map((r) => r.username)).size;
  const passing = filtered.filter((r) => r.total && r.score / r.total >= 0.7).length;

  async function exportExcel() {
    if (!rows || rows.length === 0) return;
    const XLSX = await import("xlsx");
    const data = (filtered.length ? filtered : rows).map((r) => ({
      "Học sinh": r.displayName || r.username,
      "Tên đăng nhập": r.username,
      "Bộ từ": r.setName,
      "Chế độ": modeLabel(r),
      "Thi có tính giờ": r.timed ? "Có" : "Không",
      "Thời gian làm bài (giây)": r.durationSeconds ?? "",
      "Điểm": r.score,
      "Tổng số câu": r.total,
      "Tỷ lệ đúng (%)": r.total ? Math.round((r.score / r.total) * 1000) / 10 : 0,
      "Thời điểm": new Date(r.createdAt).toLocaleString("vi-VN"),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ket qua");
    XLSX.writeFile(wb, `ket-qua-hoc-sinh-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className={cx.panel} id="admin-results-panel">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4 print:hidden">
        <div>
          <h2 className={cx.h2}>Kết quả làm bài của học sinh</h2>
          <p className={cx.desc}>Tổng hợp toàn bộ lượt kiểm tra từ vựng của học sinh.</p>
        </div>
        <div className="flex gap-2">
          <button className={`${cx.btn} ${cx.btnGold}`} onClick={() => void exportExcel()} disabled={!rows || rows.length === 0}>📊 Xuất Excel</button>
          <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => window.print()} disabled={!rows || rows.length === 0}>🖨️ In / PDF</button>
        </div>
      </div>

      {rows === null ? (
        <div className={cx.empty} role="status">Đang tải...</div>
      ) : rows.length === 0 ? (
        <div className={cx.empty}>Chưa có học sinh nào làm bài.</div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <Stat value={filteredAttempts} label="Lượt làm" />
            <Stat value={avgAccuracy === null ? "—" : `${avgAccuracy}%`} label="Điểm TB" />
            <Stat value={uniqueStudents} label="Học sinh" tone="ok" />
            <Stat value={passing} label="Đạt (≥70%)" tone="bad" />
          </div>

          <div className="mb-4 grid gap-2 rounded-lg border border-line bg-white p-3 sm:grid-cols-2 lg:grid-cols-4">
            <input type="search" className={`${cx.input} !mb-0`} placeholder="Tìm học sinh, tài khoản, bộ từ..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            <select className={`${cx.input} !mb-0`} value={studentFilter} onChange={(e) => setStudentFilter(e.target.value)}>
              <option value="">Mọi học sinh</option>
              {students.map((s) => <option key={s.username} value={s.username}>{s.name}</option>)}
            </select>
            <select className={`${cx.input} !mb-0`} value={modeFilter} onChange={(e) => setModeFilter(e.target.value)}>
              {MODE_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <div className="flex gap-2">
              <input type="date" className={`${cx.input} !mb-0`} aria-label="Từ ngày" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <input type="date" className={`${cx.input} !mb-0`} aria-label="Đến ngày" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>

          <div className="hidden overflow-x-auto rounded-lg border border-line md:block">
            <table className={cx.table}>
              <thead>
                <tr>
                  <th className={cx.th}>Học sinh</th>
                  <th className={cx.th}>Bộ từ</th>
                  <th className={cx.th}>Chế độ</th>
                  <th className={cx.th}>Điểm</th>
                  <th className={cx.th}>Thời lượng</th>
                  <th className={cx.th}>Thời điểm</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((r) => (
                  <tr key={r.id}>
                    <td className={cx.td}><div className="font-semibold">{r.displayName || r.username}</div><div className="text-xs text-muted">@{r.username}</div></td>
                    <td className={cx.td}>{r.setName}</td>
                    <td className={cx.td}>{modeLabel(r)}{r.timed && <span className={`${cx.badgeGold} ml-1.5`}>Tính giờ</span>}</td>
                    <td className={cx.td}><b>{r.score}/{r.total}</b> ({r.total ? Math.round(r.score / r.total * 100) : 0}%)</td>
                    <td className={cx.td}>{r.durationSeconds ? `${Math.floor(r.durationSeconds / 60)}p ${r.durationSeconds % 60}s` : "—"}</td>
                    <td className={cx.td}>{new Date(r.createdAt).toLocaleString("vi-VN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {paged.map((r) => (
              <article key={r.id} className="rounded-[13px] border border-line bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1"><b>{r.displayName || r.username}</b><p className="text-xs text-muted">@{r.username}</p><p className="mt-1 truncate text-sm">{r.setName}</p></div>
                  <div className="text-right"><b className="text-golddark">{r.score}/{r.total}</b><div className="text-xs text-muted">{r.total ? Math.round(r.score / r.total * 100) : 0}%</div></div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5 text-[0.72rem] text-muted">
                  <span className="rounded-full bg-[#F0EDFF] px-2 py-0.5 text-[#6550DB]">{modeLabel(r)}</span>
                  {r.timed && <span className="rounded-full bg-goldpale px-2 py-0.5 text-golddark">Tính giờ</span>}
                  <span>{r.durationSeconds ? `${Math.floor(r.durationSeconds / 60)}p ${r.durationSeconds % 60}s` : "—"}</span>
                  <span>{new Date(r.createdAt).toLocaleDateString("vi-VN")}</span>
                </div>
              </article>
            ))}
          </div>

          {filtered.length > PAGE_SIZE && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span>{filtered.length} kết quả</span>
              <div className="flex gap-1">
                <button className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1`} disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>← Trước</button>
                <span className="px-2 self-center">{page + 1}/{pageCount}</span>
                <button className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1`} disabled={page >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>Sau →</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ value, label, tone }: { value: string | number; label: string; tone?: "ok" | "bad" }) {
  return <div className="rounded-lg border border-line bg-white p-3 text-center"><div className={`font-serif text-xl font-bold ${tone === "ok" ? "text-ok" : tone === "bad" ? "text-bad" : ""}`}>{value}</div><div className="text-[0.72rem] text-muted">{label}</div></div>;
}
