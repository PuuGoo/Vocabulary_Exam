import Link from "next/link";
import { getSession } from "@/lib/auth";
import StudyPlannerCard from "@/components/StudyPlannerCard";
import PlannerConnectionPanel from "@/components/planner/PlannerConnectionPanel";
import { loadPlannerConnectionForUser, plannerDashboard, plannerConnectionHistory } from "@/lib/studyPlanner/queries";
import { todayLocal } from "@/lib/studyPlanner/values";
import {
  PlannerBar,
  PlannerEmpty,
  PlannerKpiStrip,
  PlannerPageHeader,
  PlannerPill,
  PlannerSection,
  formatDayMonth,
} from "@/components/planner/PlannerShell";

export const dynamic = "force-dynamic";

function formatWhen(value: Date | null | undefined): string {
  if (!value) return "chưa có";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function rank4(gpa4: number): string {
  if (gpa4 >= 3.6) return "Xuất sắc";
  if (gpa4 >= 3.2) return "Giỏi";
  if (gpa4 >= 2.5) return "Khá";
  if (gpa4 >= 2) return "Trung bình";
  return "Yếu";
}

const QUICK_LINKS = [
  { href: "/study-planner/daily", label: "Kế hoạch ngày" },
  { href: "/study-planner/tasks", label: "Nhật ký nhiệm vụ" },
  { href: "/study-planner/curriculum", label: "Giáo trình" },
  { href: "/study-planner/schedule", label: "Lịch học" },
  { href: "/study-planner/week", label: "Lịch tuần" },
  { href: "/study-planner/assignments", label: "Bài tập & deadline" },
  { href: "/study-planner/classes", label: "Lớp học & GPA" },
  { href: "/study-planner/attendance", label: "Chuyên cần" },
  { href: "/study-planner/habits", label: "Thói quen" },
  { href: "/study-planner/todos", label: "Việc cần làm" },
  { href: "/study-planner/activities", label: "Hoạt động" },
  { href: "/study-planner/reading", label: "Tài liệu đọc" },
];

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
      <section className="space-y-4">
        <PlannerPageHeader title="STUDY PLANNER" subtitle="Kết nối Google Sheet để bắt đầu đồng bộ kế hoạch học tập." />
        {searchParams.googleError ? (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            Kết nối Google chưa hoàn tất. Bạn có thể thử kết nối lại.
          </p>
        ) : null}
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
  const hasData =
    dashboard.todayTasks > 0 ||
    dashboard.overdueAssignments > 0 ||
    dashboard.attendancePresent + dashboard.attendanceLate + dashboard.attendanceAbsent > 0 ||
    dashboard.readingInProgress > 0 ||
    dashboard.gpa != null;

  const taskRate = dashboard.todayTasks ? Math.round((dashboard.completedToday / dashboard.todayTasks) * 100) : 0;
  const attendanceTotal = dashboard.attendancePresent + dashboard.attendanceLate + dashboard.attendanceAbsent;
  const attendanceRate = attendanceTotal ? Math.round(((dashboard.attendancePresent + dashboard.attendanceLate) / attendanceTotal) * 100) : 0;

  return (
    <section className="space-y-4">
      <PlannerPageHeader
        title="TỔNG QUAN STUDY PLANNER"
        subtitle={`Hôm nay ${formatDayMonth(today)} · đồng bộ lần cuối ${formatWhen(connection.lastSyncedAt)}`}
        actions={
          <>
            <PlannerPill tone={connection.status === "connected" ? "ok" : "or"}>
              {connection.status === "connected" ? "Đã kết nối" : connection.status}
            </PlannerPill>
            {lastRun ? <PlannerPill tone="navy">Run {lastRun.status} · đọc {lastRun.rowsRead} dòng</PlannerPill> : null}
          </>
        }
      />

      {connection.lastError ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{connection.lastError}</p>
      ) : null}

      <PlannerConnectionPanel />

      {hasData ? (
        <>
          {dashboard.gpa != null ? (
            <div className="lexora-card border-slate-200 bg-[#e9eeff] p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-[#1d40ad]">GPA trung bình (hệ 10)</p>
                  <p className="mt-1 text-3xl font-extrabold text-[#1E3989]">{dashboard.gpa}</p>
                </div>
                <PlannerPill tone="navy">Xếp loại {rank4((dashboard.gpa / 10) * 4)}</PlannerPill>
              </div>
            </div>
          ) : null}

          <PlannerKpiStrip
            items={[
              { label: "Nhiệm vụ hôm nay", value: dashboard.todayTasks },
              { label: "Đã hoàn thành", value: dashboard.completedToday },
              { label: "Còn lại", value: dashboard.remainingToday },
              { label: "Tỷ lệ hoàn thành", value: `${taskRate}%`, progress: taskRate },
              { label: "Bài quá hạn", value: dashboard.overdueAssignments, tone: dashboard.overdueAssignments ? "late" : "ok" },
              { label: "Bài sắp đến hạn", value: dashboard.dueSoonAssignments, tone: dashboard.dueSoonAssignments ? "or" : "ok" },
              { label: "Buổi có mặt", value: dashboard.attendancePresent },
              { label: "Buổi đi muộn", value: dashboard.attendanceLate },
              { label: "Buổi vắng", value: dashboard.attendanceAbsent },
              { label: "Tài liệu đang đọc", value: dashboard.readingInProgress },
            ]}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <PlannerSection title="Chuyên cần">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Tỷ lệ có mặt + đi muộn</span>
                <span className="font-semibold text-slate-700">{attendanceRate}%</span>
              </div>
              <div className="mt-2">
                <PlannerBar value={attendanceRate} tone={attendanceRate < 80 ? "late" : "ok"} />
              </div>
              {attendanceRate < 80 && attendanceTotal ? (
                <p className="mt-2 text-xs font-medium text-red-700">Cảnh báo cấm thi: dưới 80%.</p>
              ) : null}
            </PlannerSection>

            <PlannerSection title="Nhiệm vụ hôm nay">
              {dashboard.todayTasks ? (
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Đã xong {dashboard.completedToday}/{dashboard.todayTasks}</span>
                  <span className="font-semibold text-slate-700">Còn {dashboard.remainingToday}</span>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Hôm nay chưa có nhiệm vụ nào. Thêm ở Nhật ký nhiệm vụ.</p>
              )}
              <div className="mt-2">
                <PlannerBar value={taskRate} />
              </div>
            </PlannerSection>
          </div>

          <PlannerSection title="Liên kết nhanh">
            <div className="flex flex-wrap gap-2">
              {QUICK_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                  {link.label}
                </Link>
              ))}
              <a
                href={connection.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${encodeURIComponent(connection.spreadsheetId)}/edit`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-[#1E3989] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#17306f]"
              >
                Mở Google Sheet
              </a>
            </div>
          </PlannerSection>
        </>
      ) : (
        <PlannerEmpty
          title="Chưa có dữ liệu Study Planner."
          body="Hãy nhập trực tiếp trong Google Sheet của bạn — mọi thay đổi sẽ tự xuất hiện ở đây."
          action={
            <Link href="/study-planner/tasks" className="rounded-xl bg-[#1E3989] px-4 py-2 text-sm font-semibold text-white">
              Tạo nhiệm vụ đầu tiên
            </Link>
          }
        />
      )}
    </section>
  );
}
