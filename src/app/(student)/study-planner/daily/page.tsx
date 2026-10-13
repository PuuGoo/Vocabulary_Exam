import { getSession } from "@/lib/auth";
import { loadPlannerConnectionForUser, listPlannerTasks } from "@/lib/studyPlanner/queries";
import { todayLocal } from "@/lib/studyPlanner/values";
import PlannerTaskList from "@/components/planner/PlannerTaskList";
import {
  PlannerEmpty,
  PlannerKpiStrip,
  PlannerPageHeader,
  PlannerPill,
  PlannerSection,
  PlannerTable,
  formatClock,
} from "@/components/planner/PlannerShell";

export const dynamic = "force-dynamic";

const WEEKDAY = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];

function weekdayLabel(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return WEEKDAY[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

/**
 * Route 2 — Kế hoạch ngày & IELTS.
 *
 * The workbook derives the daily view from Nhật ký nhiệm vụ, so the web shows
 * the same joined data rather than a duplicated copy: tasks filtered to the
 * selected calendar date, plus IELTS-skill rows wherever they are set.
 */
export default async function PlannerDailyPage({ searchParams }: { searchParams: { date?: string } }) {
  const session = await getSession();
  const connection = session ? await loadPlannerConnectionForUser(session.userId) : null;
  if (!connection) {
    return (
      <section className="space-y-4">
        <PlannerPageHeader title="KẾ HOẠCH NGÀY & IELTS" subtitle="Kết nối Study Planner để xem kế hoạch ngày." />
        <PlannerEmpty title="Chưa kết nối Study Planner." body="Hãy kết nối Google Sheet ở Tổng quan trước khi xem kế hoạch ngày." />
      </section>
    );
  }

  const date = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date ?? "") ? searchParams.date! : todayLocal();
  const tasks = await listPlannerTasks(connection.id, { from: date, to: date });
  const ielts = tasks.filter((task) => task.ieltsSkill);
  const completed = tasks.filter((task) => task.completed).length;
  const minutes = tasks.reduce((sum, task) => {
    if (task.durationMinutes != null) return sum + task.durationMinutes;
    if (task.startTime != null && task.endTime != null) {
      const span = Math.round((task.endTime - task.startTime) * 1440);
      return sum + (span > 0 ? span : span + 1440);
    }
    return sum;
  }, 0);
  const bands = ielts.map((task) => Number(task.ieltsBand)).filter((value) => Number.isFinite(value) && value > 0);
  const avgBand = bands.length ? (bands.reduce((sum, value) => sum + value, 0) / bands.length).toFixed(1) : null;
  const rate = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;

  return (
    <section className="space-y-4">
      <PlannerPageHeader
        title="KẾ HOẠCH NGÀY & IELTS"
        subtitle={`${weekdayLabel(date)}, ${date} · ${tasks.length} nhiệm vụ · ${ielts.length} buổi luyện IELTS`}
        actions={
          <form method="get" className="flex items-center gap-2">
            <input aria-label="Chọn ngày" type="date" name="date" defaultValue={date} className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-sm text-white" />
            <button type="submit" className="rounded-xl bg-white px-3.5 py-2 text-sm font-semibold text-[#1E3989]">Xem</button>
          </form>
        }
      />

      <PlannerKpiStrip
        items={[
          { label: "Nhiệm vụ hôm nay", value: tasks.length },
          { label: "Đã hoàn thành", value: completed },
          { label: "Tỷ lệ hoàn thành", value: `${rate}%`, progress: rate },
          { label: "Tổng thời gian", value: `${minutes.toLocaleString("vi-VN")} phút` },
          { label: "Band IELTS TB", value: avgBand ? `Band ${avgBand}` : "—" },
        ]}
      />

      {ielts.length ? (
        <PlannerSection title={`Luyện IELTS (${ielts.length})`}>
          <PlannerTable columns={["Giờ", "Nhiệm vụ", "Kỹ năng", "Tài liệu", "Dạng bài", "Band", "Rút kinh nghiệm"]} minWidth={1000}>
            {ielts.map((task) => (
              <tr key={task.id} className="align-top hover:bg-slate-50">
                <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                  {task.startTime != null ? `${formatClock(task.startTime)}${task.endTime != null ? `–${formatClock(task.endTime)}` : ""}` : "—"}
                </td>
                <td className="px-3 py-2.5 font-medium text-slate-900">{task.taskTitle}</td>
                <td className="px-3 py-2.5">
                  {task.ieltsSkill ? <PlannerPill tone="prog">{task.ieltsSkill}</PlannerPill> : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-3 py-2.5 text-slate-600">{task.ieltsMaterial || "—"}</td>
                <td className="px-3 py-2.5 text-slate-600">{task.ieltsTaskType || "—"}</td>
                <td className="px-3 py-2.5 font-semibold text-slate-800">{task.ieltsBand != null && task.ieltsBand !== "" ? String(task.ieltsBand) : "—"}</td>
                <td className="max-w-[260px] px-3 py-2.5 text-slate-500">{task.ieltsMistakeAnalysis || ""}</td>
              </tr>
            ))}
          </PlannerTable>
        </PlannerSection>
      ) : null}

      <PlannerSection title="Nhật ký nhiệm vụ trong ngày">
        <PlannerTaskList initial={tasks} />
      </PlannerSection>
    </section>
  );
}
