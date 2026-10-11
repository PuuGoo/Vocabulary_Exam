import Link from "next/link";
import { getSession } from "@/lib/auth";
import StudyPlannerCard from "@/components/StudyPlannerCard";
import { loadPlannerConnectionForUser, plannerDashboard, plannerConnectionHistory } from "@/lib/studyPlanner/queries";
import { todayLocal } from "@/lib/studyPlanner/values";

export const dynamic = "force-dynamic";

const KPIS: Array<{ key: keyof Awaited<ReturnType<typeof plannerDashboard>>; label: string }> = [
  { key: "todayTasks", label: "Nhiệm vụ hôm nay" },
  { key: "completedToday", label: "Đã hoàn thành" },
  { key: "remainingToday", label: "Còn lại" },
  { key: "overdueAssignments", label: "Bài quá hạn" },
  { key: "dueSoonAssignments", label: "Bài sắp đến hạn" },
  { key: "attendancePresent", label: "Buổi có mặt" },
  { key: "attendanceLate", label: "Buổi đi muộn" },
  { key: "attendanceAbsent", label: "Buổi vắng" },
  { key: "readingInProgress", label: "Tài liệu đang đọc" },
];

function formatWhen(value: Date | null | undefined): string {
  if (!value) return "chưa có";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

/**
 * Route 1 — Dashboard.
 *
 * Recreates the workbook Dashboard from real PostgreSQL rows: no demo values,
 * a proper empty state when nothing exists, connection health and last sync
 * time, and quick links into every planner section.
 */
export default async function StudyPlannerPage({ searchParams }: { searchParams: { googleError?: string } }) {
  const session = await getSession();
  const connection = session ? await loadPlannerConnectionForUser(session.userId) : null;
  if (!connection) {
    return (
      <section className="space-y-5">
        <h1 className="text-2xl font-bold">Study Planner</h1>
        {searchParams.googleError && (
          <p role="alert" className="text-red-700">Kết nối Google chưa hoàn tất. Bạn có thể thử kết nối lại.</p>
        )}
        <StudyPlannerCard setup />
      </section>
    );
  }

  const today = todayLocal();
  const [dashboard, history] = await Promise.all([
    plannerDashboard(connection.id, today),
    plannerConnectionHistory(connection.id, 5),
  ]);
  const lastRun = history[0] ?? null;
  const hasData = KPIS.some((kpi) => (dashboard[kpi.key] as number) > 0) || dashboard.gpa != null;

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tổng quan Study Planner</h1>
          <p className="text-sm text-muted">Ngày {today} · đồng bộ lần cuối {formatWhen(connection.lastSyncedAt)}</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className={`rounded-full px-2 py-1 ${connection.status === "connected" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
            {connection.status === "connected" ? "Đã kết nối" : connection.status}
          </span>
          {lastRun ? (
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
              Run {lastRun.status} · đọc {lastRun.rowsRead} dòng
            </span>
          ) : null}
        </div>
      </header>

      {connection.lastError ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{connection.lastError}</p>
      ) : null}

      {hasData ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {KPIS.map((kpi) => (
              <div key={kpi.key} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-500">{kpi.label}</p>
                <p className="mt-1 text-2xl font-bold">{String(dashboard[kpi.key] ?? 0)}</p>
              </div>
            ))}
          </div>
          {dashboard.gpa != null ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">GPA trung bình</p>
              <p className="mt-1 text-2xl font-bold">{dashboard.gpa}</p>
            </div>
          ) : null}
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          <p className="font-semibold">Chưa có dữ liệu Study Planner.</p>
          <p className="mt-1">
            Hãy nhập trực tiếp trong Google Sheet của bạn — mọi thay đổi sẽ tự xuất hiện ở đây, hoặc{" "}
            <Link className="underline" href="/study-planner/tasks">tạo nhiệm vụ đầu tiên</Link>.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Link href="/study-planner/daily" className="rounded-xl bg-slate-100 px-3 py-2 text-sm hover:bg-slate-200">Kế hoạch ngày</Link>
        <Link href="/study-planner/classes" className="rounded-xl bg-slate-100 px-3 py-2 text-sm hover:bg-slate-200">Lớp học & GPA</Link>
        <Link href="/study-planner/assignments" className="rounded-xl bg-slate-100 px-3 py-2 text-sm hover:bg-slate-200">Deadline</Link>
        <Link href="/study-planner/habits" className="rounded-xl bg-slate-100 px-3 py-2 text-sm hover:bg-slate-200">Thói quen</Link>
        <a
          href={connection.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${encodeURIComponent(connection.spreadsheetId)}/edit`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl bg-gold px-3 py-2 text-sm font-semibold text-white"
        >
          Mở Google Sheet
        </a>
      </div>
    </section>
  );
}
