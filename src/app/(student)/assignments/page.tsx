"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cx } from "@/components/ui";
import { ASSIGNMENT_MODE_LABELS, AssignmentMode, AssignmentStatus } from "@/lib/assignments";

type AssignmentRow = {
  id: number;
  className: string;
  setName: string;
  title: string;
  instructions: string;
  mode: AssignmentMode;
  minScore: number;
  dueAt: string | null;
  originalDueAt: string | null;
  extensionDueAt: string | null;
  timeLimitMinutes: number | null;
  status: AssignmentStatus;
  completedAt: string | null;
  bestAccuracy: number | null;
  attemptCount: number;
  href: string;
  submission: { submittedAt: string; fileName: string | null } | null;
};

const statusMeta: Record<AssignmentStatus, { label: string; className: string }> = {
  pending: { label: "Chưa làm", className: "bg-[#e4ecf3] text-[#2b4a6b]" },
  in_progress: { label: "Đang làm", className: "bg-goldpale text-golddark" },
  overdue: { label: "Quá hạn", className: "bg-badbg text-bad" },
  completed: { label: "Đã hoàn thành", className: "bg-[#e5f4ea] text-ok" },
  completed_late: { label: "Hoàn thành muộn", className: "bg-[#f3ece2] text-[#805b2b]" },
  excused: { label: "Được miễn", className: "bg-[#eeeaf6] text-[#654a83]" },
};

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("vi-VN", { dateStyle: "medium", timeStyle: "short" }) : "Không giới hạn";
}

function AssignmentCard({ row }: { row: AssignmentRow }) {
  const done = row.status === "completed" || row.status === "completed_late" || row.status === "excused";
  const meta = statusMeta[row.status];
  const cta = row.status === "excused" ? "Luyện thêm" : done ? "Làm lại" : row.attemptCount ? "Tiếp tục" : "Bắt đầu";
  return (
    <article className="rounded-[10px] border border-line bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[0.72rem] font-semibold ${meta.className}`}>{meta.label}</span>
            <span className="text-[0.76rem] text-muted">{row.className}</span>
            {row.extensionDueAt && <span className="rounded-full bg-[#e5f4ea] px-2 py-0.5 text-[0.68rem] font-semibold text-ok">Đã gia hạn</span>}
            {row.submission && <span className="rounded-full bg-[#e4ecf3] px-2 py-0.5 text-[0.68rem] font-semibold text-[#2b4a6b]">Đã nộp bài</span>}
          </div>
          <h3 className="font-serif text-lg font-semibold">{row.title}</h3>
          <p className="mt-0.5 text-[0.84rem] text-muted">{row.setName} · {ASSIGNMENT_MODE_LABELS[row.mode]}</p>
        </div>
        {row.bestAccuracy !== null && <div className="shrink-0 text-right"><b className="text-lg">{row.bestAccuracy}%</b><div className="text-[0.7rem] text-muted">cao nhất</div></div>}
      </div>
      {row.instructions && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-[#faf8f2] p-3 text-[0.85rem]">{row.instructions}</p>}
      <div className="mt-3 grid gap-2 text-[0.8rem] text-muted sm:grid-cols-3">
        <span>Hạn: <b className="font-medium text-ink">{formatDate(row.dueAt)}</b></span>
        <span>Yêu cầu: <b className="font-medium text-ink">≥ {row.minScore}%</b></span>
        <span>{row.timeLimitMinutes ? `Thời gian: ${row.timeLimitMinutes} phút` : `${row.attemptCount} lượt đã làm`}</span>
      </div>
      {row.status === "overdue" && <p className="mt-2 text-[0.78rem] text-bad">Bạn vẫn có thể làm bài; kết quả sẽ được ghi nhận là nộp muộn.</p>}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Link href={`/assignments/${row.id}/submit`} className={`${cx.btn} ${cx.btnGhost}`}>{row.submission ? "Sửa bài nộp" : "Nộp file / ảnh / text"}</Link>
        <Link href={row.href} className={`${cx.btn} ${done ? cx.btnGhost : cx.btnGold}`}>{cta} →</Link>
      </div>
    </article>
  );
}

export default function AssignmentsPage() {
  const [rows, setRows] = useState<AssignmentRow[] | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "urgent" | "done">("all");

  async function load() {
    setRows(null);
    setError(false);
    try {
      const response = await fetch("/api/assignments");
      if (!response.ok) throw new Error("load failed");
      const data = await response.json();
      setRows(data.assignments || []);
    } catch {
      setRows([]);
      setError(true);
    }
  }

  useEffect(() => { void load(); }, []);
  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("vi");
    const now = Date.now();
    return (rows || []).filter((row) => {
      if (normalized && !`${row.title} ${row.setName} ${row.className}`.toLocaleLowerCase("vi").includes(normalized)) return false;
      const done = row.status === "completed" || row.status === "completed_late" || row.status === "excused";
      if (filter === "active" && done) return false;
      if (filter === "done" && !done) return false;
      if (filter === "urgent" && !(row.status === "overdue" || (!done && row.dueAt && new Date(row.dueAt).getTime() <= now + 3 * 86400000))) return false;
      return true;
    });
  }, [rows, query, filter]);
  const groups = useMemo(() => ({
    active: filteredRows.filter((row) => row.status !== "completed" && row.status !== "completed_late" && row.status !== "excused"),
    done: filteredRows.filter((row) => row.status === "completed" || row.status === "completed_late" || row.status === "excused"),
  }), [filteredRows]);
  const totalActive = rows?.filter((row) => row.status !== "completed" && row.status !== "completed_late" && row.status !== "excused").length || 0;

  return (
    <div className={cx.panel}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div><h2 className={cx.h2}>Bài tập của tôi</h2><p className={cx.desc + " !mb-0"}>Bài được giao theo lớp và tự hoàn thành khi bạn đạt điểm yêu cầu.</p></div>
        {rows && rows.length > 0 && <div className="rounded-lg bg-goldpale px-3 py-2 text-sm"><b>{totalActive}</b> bài cần làm</div>}
      </div>
      {rows && rows.length > 0 && <div className="mb-5 rounded-lg border border-line bg-white p-3"><input type="search" className={`${cx.input} !mb-2`} placeholder="Tìm theo tên bài, bộ từ hoặc lớp..." value={query} onChange={(event) => setQuery(event.target.value)} /><div className="flex flex-wrap gap-2">{([['all','Tất cả'],['active','Cần làm'],['urgent','Sắp hạn / quá hạn'],['done','Đã xử lý']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-full border px-3 py-1.5 text-[0.78rem] ${filter === value ? "border-ink bg-ink text-white" : "border-line hover:border-gold"}`}>{label}</button>)}<span className="ml-auto self-center text-[0.72rem] text-muted">{filteredRows.length}/{rows.length} bài</span></div></div>}
      {rows === null ? <div className={cx.empty} role="status">Đang tải bài tập...</div>
        : error ? <div className={cx.empty}>Không thể tải bài tập.<div className="mt-3"><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => void load()}>Thử lại</button></div></div>
        : rows.length === 0 ? <div className={cx.empty}>Bạn chưa có bài tập nào được giao.<div className="mt-3"><Link href="/study" className={`${cx.btn} ${cx.btnGold}`}>Tự luyện tập</Link></div></div>
        : filteredRows.length === 0 ? <div className={cx.empty}>Không tìm thấy bài tập phù hợp.<div className="mt-3"><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => { setQuery(""); setFilter("all"); }}>Xóa bộ lọc</button></div></div>
        : <div className="space-y-6">
          <section><h3 className="mb-3 font-serif text-base">Cần hoàn thành ({groups.active.length})</h3>{groups.active.length ? <div className="grid gap-3 lg:grid-cols-2">{groups.active.map((row) => <AssignmentCard key={row.id} row={row} />)}</div> : <div className="rounded-lg border border-line bg-[#faf8f2] p-4 text-sm text-ok">Bạn đã hoàn thành tất cả bài tập hiện tại.</div>}</section>
          {groups.done.length > 0 && <section><h3 className="mb-3 font-serif text-base">Đã hoàn thành ({groups.done.length})</h3><div className="grid gap-3 lg:grid-cols-2">{groups.done.map((row) => <AssignmentCard key={row.id} row={row} />)}</div></section>}
        </div>}
    </div>
  );
}
