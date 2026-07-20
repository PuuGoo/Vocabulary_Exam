"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ASSIGNMENT_MODE_LABELS, AssignmentMode, AssignmentStatus } from "@/lib/assignments";

type ReminderRow = {
  id: number;
  title: string;
  className: string;
  mode: AssignmentMode;
  dueAt: string | null;
  status: AssignmentStatus;
  href: string;
};

const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;

function needsAttention(row: ReminderRow) {
  if (row.status === "completed" || row.status === "completed_late" || row.status === "excused") return false;
  if (row.status === "overdue") return true;
  return row.dueAt ? new Date(row.dueAt).getTime() <= Date.now() + THREE_DAYS : false;
}

function dueLabel(row: ReminderRow) {
  if (row.status === "overdue") return "Đã quá hạn · vẫn được nộp muộn";
  if (!row.dueAt) return "Không giới hạn thời gian";
  const due = new Date(row.dueAt);
  const hours = Math.ceil((due.getTime() - Date.now()) / 3_600_000);
  if (hours <= 24) return `Còn khoảng ${Math.max(1, hours)} giờ`;
  return `Hạn ${due.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}`;
}

export default function AssignmentReminder() {
  const [rows, setRows] = useState<ReminderRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/assignments");
      if (!response.ok) throw new Error();
      const data = await response.json();
      setRows((data.assignments || []).filter((row: ReminderRow) => row.status !== "completed" && row.status !== "completed_late" && row.status !== "excused"));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    function close(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", closeWithEscape);
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("keydown", closeWithEscape); };
  }, []);

  const urgent = rows.filter(needsAttention);
  const visible = (urgent.length ? urgent : rows).slice(0, 5);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="relative rounded-md border border-goldpale/40 bg-transparent px-2.5 py-1.5 text-[0.8rem] text-goldpale hover:border-gold hover:text-gold"
        aria-label={urgent.length ? `${urgent.length} bài tập cần chú ý` : "Nhắc bài tập"}
        aria-expanded={open}
        title="Nhắc bài tập"
        onClick={() => { const next = !open; setOpen(next); if (next) void load(); }}
      >
        <span aria-hidden="true">🔔</span>
        {urgent.length > 0 && <span className="absolute -right-1.5 -top-2 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-bad px-1 text-[0.62rem] font-bold leading-4 text-white">{urgent.length > 9 ? "9+" : urgent.length}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-[10px] border border-line bg-white text-ink shadow-lg">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div><b className="font-serif text-sm">Nhắc bài tập</b><div className="text-[0.7rem] text-muted">{urgent.length ? `${urgent.length} bài cần chú ý` : "Không có bài gấp"}</div></div>
            <Link href="/assignments" onClick={() => setOpen(false)} className="text-[0.76rem] font-semibold text-golddark hover:underline">Xem tất cả</Link>
          </div>
          {loading ? <div className="px-4 py-6 text-center text-sm text-muted">Đang cập nhật...</div>
            : visible.length === 0 ? <div className="px-4 py-6 text-center text-sm text-muted">Bạn chưa có bài tập cần làm.</div>
            : <div className="max-h-[360px] overflow-y-auto">{visible.map((row) => <Link key={row.id} href={row.href} onClick={() => setOpen(false)} className="block border-b border-line px-4 py-3 last:border-0 hover:bg-goldpale/30">
              <div className="flex items-start justify-between gap-2"><b className="line-clamp-1 text-[0.84rem]">{row.title}</b>{needsAttention(row) && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.66rem] font-semibold ${row.status === "overdue" ? "bg-badbg text-bad" : "bg-goldpale text-golddark"}`}>{row.status === "overdue" ? "Quá hạn" : "Sắp hạn"}</span>}</div>
              <div className="mt-1 text-[0.72rem] text-muted">{row.className} · {ASSIGNMENT_MODE_LABELS[row.mode]}</div>
              <div className={`mt-1 text-[0.72rem] ${row.status === "overdue" ? "text-bad" : "text-inksoft"}`}>{dueLabel(row)}</div>
            </Link>)}</div>}
          {rows.length > visible.length && <div className="border-t border-line px-4 py-2 text-center text-[0.7rem] text-muted">Còn {rows.length - visible.length} bài khác trong danh sách</div>}
        </div>
      )}
    </div>
  );
}
