"use client";

import { useEffect, useMemo, useState } from "react";
import { cx } from "@/components/ui";

type StudentProgress = {
  id: number;
  username: string;
  displayName: string;
  classes: string[];
  attempts: number;
  accuracy: number | null;
  reviewed: number;
  known: number;
  needsReview: number;
  lastActivityAt: string | null;
};

type Filter = "all" | "active" | "support" | "not_started";

export default function AdminProgressPage() {
  const [students, setStudents] = useState<StudentProgress[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  async function load() {
    setStudents(null);
    setLoadError(false);
    try {
      const res = await fetch("/api/admin/progress");
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      setStudents(data.students || []);
    } catch {
      setStudents([]);
      setLoadError(true);
    }
  }

  useEffect(() => { void load(); }, []);

  const filteredStudents = useMemo(() => {
    if (!students) return [];
    const query = searchQuery.trim().toLocaleLowerCase("vi");
    return students.filter((student) => {
      const matchesQuery = !query || `${student.displayName} ${student.username} ${student.classes.join(" ")}`.toLocaleLowerCase("vi").includes(query);
      const started = student.attempts > 0 || student.reviewed > 0;
      const needsSupport = (student.accuracy !== null && student.accuracy < 60) || student.needsReview >= 10;
      const matchesFilter = filter === "all" || (filter === "active" && started) || (filter === "support" && needsSupport) || (filter === "not_started" && !started);
      return matchesQuery && matchesFilter;
    });
  }, [students, searchQuery, filter]);

  const activeCount = students?.filter((student) => student.attempts > 0 || student.reviewed > 0).length || 0;
  const supportCount = students?.filter((student) => (student.accuracy !== null && student.accuracy < 60) || student.needsReview >= 10).length || 0;
  const accuracies = students?.filter((student) => student.accuracy !== null).map((student) => student.accuracy as number) || [];
  const average = accuracies.length ? Math.round(accuracies.reduce((sum, value) => sum + value, 0) / accuracies.length) : null;

  return (
    <div className={cx.panel}>
      <h2 className={cx.h2}>Tiến độ học tập</h2>
      <div className={cx.desc}>Tổng quan mức độ hoạt động và kết quả của từng học sinh.</div>

      {students === null ? (
        <div className={cx.empty} role="status">Đang tổng hợp tiến độ học sinh...</div>
      ) : loadError ? (
        <div className={cx.empty}>Không thể tải tiến độ.<div className="mt-3"><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => void load()}>Thử lại</button></div></div>
      ) : students.length === 0 ? (
        <div className={cx.empty}>Chưa có tài khoản học sinh.</div>
      ) : (
        <>
          <div className="my-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <Stat value={students.length} label="Học sinh" />
            <Stat value={activeCount} label="Đã bắt đầu" tone="ok" />
            <Stat value={supportCount} label="Cần hỗ trợ" tone="bad" />
            <Stat value={average === null ? "—" : `${average}%`} label="Điểm trung bình" />
          </div>

          <div className="mb-4 flex gap-2 flex-wrap">
            <input type="search" className={`${cx.input} !mb-0 min-w-[220px] flex-1`} placeholder="Tìm học sinh hoặc lớp..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
            <select className={`${cx.input} !mb-0 !w-auto`} value={filter} onChange={(event) => setFilter(event.target.value as Filter)}>
              <option value="all">Tất cả trạng thái</option>
              <option value="active">Đã bắt đầu học</option>
              <option value="support">Cần hỗ trợ</option>
              <option value="not_started">Chưa bắt đầu</option>
            </select>
          </div>

          {filteredStudents.length === 0 ? <div className={cx.empty}>Không tìm thấy học sinh phù hợp.</div> : (
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className={`${cx.table} min-w-[760px]`}>
                <thead><tr><th className={cx.th}>Học sinh</th><th className={cx.th}>Lớp</th><th className={cx.th}>Ghi nhớ</th><th className={cx.th}>Cần ôn</th><th className={cx.th}>Bài làm</th><th className={cx.th}>Điểm TB</th><th className={cx.th}>Hoạt động cuối</th></tr></thead>
                <tbody>
                  {filteredStudents.map((student) => (
                    <tr key={student.id} className="hover:bg-goldpale/30">
                      <td className={cx.td}><div className="font-semibold">{student.displayName}</div><div className="text-[0.72rem] text-muted">@{student.username}</div></td>
                      <td className={cx.td}>{student.classes.length ? student.classes.join(", ") : <span className="text-muted">Chưa xếp lớp</span>}</td>
                      <td className={cx.td}><b className="text-ok">{student.known}</b>/{student.reviewed}</td>
                      <td className={cx.td}><span className={student.needsReview >= 10 ? "font-bold text-bad" : ""}>{student.needsReview}</span></td>
                      <td className={cx.td}>{student.attempts}</td>
                      <td className={cx.td}>{student.accuracy === null ? "—" : <span className={student.accuracy < 60 ? "font-bold text-bad" : student.accuracy >= 80 ? "font-bold text-ok" : ""}>{student.accuracy}%</span>}</td>
                      <td className={`${cx.td} whitespace-nowrap`}>{student.lastActivityAt ? new Date(student.lastActivityAt).toLocaleDateString("vi-VN") : "Chưa hoạt động"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
