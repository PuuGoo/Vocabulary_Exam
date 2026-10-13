import { getSession } from "@/lib/auth";
import { loadPlannerConnectionForUser, listPlannerTasks, listPlannerAssignments, listPlannerActivities, listPlannerCourses } from "@/lib/studyPlanner/queries";
import { todayLocal } from "@/lib/studyPlanner/values";
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

const WEEKDAY_LONG = ["", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"];

function mondayOf(dateIso: string): string {
  const [year, month, day] = dateIso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dow = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (dow - 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function addDays(dateIso: string, offset: number): string {
  const [year, month, day] = dateIso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + offset);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function weekdayIndex(dateIso: string): number {
  const [year, month, day] = dateIso.split("-").map(Number);
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

function overlaps(left: { start: number | null; end: number | null }, right: { start: number | null; end: number | null }): boolean {
  if (left.start == null || left.end == null || right.start == null || right.end == null) return false;
  return left.start < right.end && right.start < left.end;
}

/**
 * Route 6 — Lịch tuần (classes + assignments + tasks + activities).
 *
 * Week selection, day navigation and overlap warnings, each linking back to
 * the original record page. Times overlap the same way across sources: two
 * events sharing a day warn only when their time windows actually overlap.
 */
export default async function PlannerWeekPage({ searchParams }: { searchParams: { day?: string } }) {
  const session = await getSession();
  const connection = session ? await loadPlannerConnectionForUser(session.userId) : null;
  if (!connection) {
    return (
      <section className="space-y-4">
        <PlannerPageHeader title="LỊCH TUẦN" subtitle="Kết nối Study Planner để xem lịch tuần." />
        <PlannerEmpty title="Chưa kết nối Study Planner." body="Hãy kết nối Google Sheet ở Tổng quan trước khi xem lịch tuần." />
      </section>
    );
  }

  const today = todayLocal();
  const cursor = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.day ?? "") ? searchParams.day! : today;
  const monday = mondayOf(cursor);
  const week = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  const [tasks, assignments, activities, { courses, sessions }] = await Promise.all([
    listPlannerTasks(connection.id, { from: week[0], to: week[6] }),
    listPlannerAssignments(connection.id),
    listPlannerActivities(connection.id, { from: week[0], to: week[6] }),
    listPlannerCourses(connection.id),
  ]);
  const courseName = new Map(courses.map((course) => [course.id, course.courseName]));
  const days = week.map((date) => ({
    date,
    weekday: weekdayIndex(date),
    sessions: sessions.filter((item) => item.weekday === weekdayIndex(date)).sort((a, b) => a.startTime - b.startTime),
    tasks: tasks.filter((task) => task.taskDate === date),
    activities: activities.filter((activity) => activity.activityDate === date),
  }));
  const deadlines = assignments.filter((item) => item.dueDate && item.dueDate >= week[0] && item.dueDate <= week[6]);
  const conflicts = days
    .filter((day) => {
      const timed = [
        ...day.sessions.map((item) => ({ start: item.startTime, end: item.endTime })),
        ...day.activities.map((activity) => ({ start: activity.startTime, end: activity.endTime })),
      ];
      for (let a = 0; a < timed.length; a += 1) for (let b = a + 1; b < timed.length; b += 1) if (overlaps(timed[a], timed[b])) return true;
      return false;
    })
    .map((day) => day.date);

  const weekTasks = days.reduce((sum, day) => sum + day.tasks.length, 0);
  const weekSessions = days.reduce((sum, day) => sum + day.sessions.length, 0);

  return (
    <section className="space-y-4">
      <PlannerPageHeader
        title="LỊCH TUẦN"
        subtitle={`${week[0]} → ${week[6]} · ${weekSessions} buổi học · ${weekTasks} nhiệm vụ · ${deadlines.length} deadline`}
        actions={
          <form method="get" className="flex flex-wrap items-center gap-2">
            <a className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-sm font-medium text-white" href={`/study-planner/week?day=${encodeURIComponent(addDays(monday, -7))}`}>← Tuần trước</a>
            <input aria-label="Chọn ngày trong tuần" type="date" name="day" defaultValue={cursor} className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-sm text-white" />
            <button className="rounded-xl bg-white px-3.5 py-2 text-sm font-semibold text-[#1E3989]" type="submit">Xem</button>
            <a className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-sm font-medium text-white" href={`/study-planner/week?day=${encodeURIComponent(addDays(monday, 7))}`}>Tuần sau →</a>
          </form>
        }
      />

      <PlannerKpiStrip
        items={[
          { label: "Buổi học", value: weekSessions },
          { label: "Nhiệm vụ", value: weekTasks },
          { label: "Deadline", value: deadlines.length },
          { label: "Ngày có trùng giờ", value: conflicts.length, tone: conflicts.length ? "or" : "ok" },
        ]}
      />

      {conflicts.length ? (
        <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Có khung giờ trùng lặp vào {conflicts.join(", ")}. Hãy kiểm tra chi tiết từng ngày.
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
        {days.map((day) => {
          const isToday = day.date === today;
          return (
            <div
              key={day.date}
              className={`space-y-2 rounded-2xl border bg-white p-3 ${isToday ? "border-[#1E3989] ring-1 ring-[#1E3989]/30" : "border-slate-200"}`}
            >
              <div className="flex items-baseline justify-between gap-1">
                <p className="text-xs font-semibold text-slate-700">{WEEKDAY_LONG[day.weekday]}</p>
                {isToday ? <span className="rounded-full bg-[#1E3989] px-2 py-0.5 text-[10px] font-medium text-white">Hôm nay</span> : null}
              </div>
              <p className="text-[11px] text-slate-500">{day.date.slice(8, 10)}/{day.date.slice(5, 7)}/{day.date.slice(0, 4)}</p>

              {day.sessions.map((item) => (
                <div key={`s-${item.id}`} className="rounded-xl bg-[#e9eeff] px-3 py-2 text-xs">
                  <p className="font-medium text-[#1E3989]">{formatClock(item.startTime)}–{formatClock(item.endTime)}</p>
                  <p className="text-slate-700">{courseName.get(item.courseId) ?? "Môn học"}{item.room ? ` · ${item.room}` : ""}</p>
                </div>
              ))}
              {day.tasks.map((task) => (
                <a key={`t-${task.id}`} href="/study-planner/tasks" className={`block rounded-xl px-3 py-2 text-xs ${task.completed ? "bg-slate-50 text-slate-400 line-through" : "bg-slate-50 text-slate-700"}`}>
                  {task.taskTitle}
                </a>
              ))}
              {day.activities.map((activity) => (
                <a key={`a-${activity.id}`} href="/study-planner/activities" className="block rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  {activity.startTime != null ? `${formatClock(activity.startTime)} · ` : ""}{activity.activityName}
                </a>
              ))}
              {conflicts.includes(day.date) ? <PlannerPill tone="or">⚠ Trùng giờ</PlannerPill> : null}
              {!day.sessions.length && !day.tasks.length && !day.activities.length ? (
                <p className="text-[11px] text-slate-400">Trống</p>
              ) : null}
            </div>
          );
        })}
      </div>

      {deadlines.length ? (
        <PlannerSection title={`Deadline tuần này (${deadlines.length})`}>
          <PlannerTable columns={["Môn học", "Mô tả", "Hạn nộp", "Trạng thái"]} minWidth={620}>
            {deadlines
              .slice()
              .sort((left, right) => (left.dueDate ?? "").localeCompare(right.dueDate ?? ""))
              .map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-semibold text-slate-900">{item.subject || "—"}</td>
                  <td className="px-3 py-2.5 text-slate-800">
                    <a href="/study-planner/assignments" className="underline">{item.description}</a>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                    {item.dueDate}{item.dueTime != null ? ` ${formatClock(item.dueTime)}` : ""}
                  </td>
                  <td className="px-3 py-2.5">
                    <PlannerPill tone={item.grade ? "ok" : (item.dueDate ?? "") < today ? "late" : "prog"}>
                      {item.grade ? "Đã xong" : (item.dueDate ?? "") < today ? "Quá hạn" : "Đang chờ"}
                    </PlannerPill>
                  </td>
                </tr>
              ))}
          </PlannerTable>
        </PlannerSection>
      ) : null}
    </section>
  );
}
