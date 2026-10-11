import { getSession } from "@/lib/auth";
import { loadPlannerConnectionForUser, listPlannerTasks, listPlannerAssignments, listPlannerActivities, listPlannerCourses } from "@/lib/studyPlanner/queries";
import { todayLocal } from "@/lib/studyPlanner/values";

export const dynamic = "force-dynamic";

const WEEKDAY = ["", "T2", "T3", "T4", "T5", "T6", "T7", "CN"];

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
  const date = new Date(Date.UTC(year, month - 1, day));
  const dow = date.getUTCDay();
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
    return <section className="space-y-4"><h1 className="text-2xl font-bold">Lịch tuần</h1><p className="text-sm text-muted">Hãy kết nối Study Planner để xem lịch tuần.</p></section>;
  }
  const cursor = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.day ?? "") ? searchParams.day! : todayLocal();
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
    sessions: sessions.filter((item) => item.weekday === weekdayIndex(date)),
    tasks: tasks.filter((task) => task.taskDate === date),
    activities: activities.filter((activity) => activity.activityDate === date),
  }));
  const deadlines = assignments.filter((item) => item.dueDate && item.dueDate >= week[0] && item.dueDate <= week[6]);
  const conflicts = days.filter((day) => {
    const timed = [
      ...day.sessions.map((item) => ({ start: item.startTime, end: item.endTime })),
      ...day.activities.map((activity) => ({ start: activity.startTime, end: activity.endTime })),
    ];
    for (let a = 0; a < timed.length; a += 1) for (let b = a + 1; b < timed.length; b += 1) if (overlaps(timed[a], timed[b])) return true;
    return false;
  }).map((day) => day.date);
  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-2xl font-bold">Lịch tuần</h1><p className="text-sm text-muted">{week[0]} → {week[6]}</p></div>
        <form method="get" className="flex items-center gap-2">
          <a className="rounded-xl bg-slate-100 px-3 py-2 text-sm" href={`/study-planner/week?day=${encodeURIComponent(addDays(monday, -7))}`}>Tuần trước</a>
          <input aria-label="Chọn ngày trong tuần" type="date" name="day" defaultValue={cursor} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
          <button className="rounded-xl bg-slate-100 px-3 py-2 text-sm" type="submit">Xem</button>
          <a className="rounded-xl bg-slate-100 px-3 py-2 text-sm" href={`/study-planner/week?day=${encodeURIComponent(addDays(monday, 7))}`}>Tuần sau</a>
        </form>
      </header>
      {conflicts.length ? <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">Có khung giờ trùng lặp vào {conflicts.join(", ")}. Hãy kiểm tra chi tiết từng ngày.</p> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
        {days.map((day) => (
          <div key={day.date} className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
            <p className="text-xs font-semibold text-slate-600">{WEEKDAY[day.weekday]} · {day.date}</p>
            {day.sessions.length ? <p className="text-xs text-slate-600"><span className="font-semibold">{day.sessions.length}</span> buổi học: {day.sessions.map((item) => courseName.get(item.courseId) ?? "Môn học").join(", ")}</p> : null}
            {day.tasks.map((task) => <a key={task.id} href="/study-planner/tasks" className="block rounded-xl bg-slate-50 px-3 py-2 text-sm">{task.taskTitle}</a>)}
            {day.activities.map((activity) => <a key={activity.id} href="/study-planner/activities" className="block rounded-xl bg-indigo-50 px-3 py-2 text-sm">{activity.activityName}</a>)}
          </div>
        ))}
      </div>
      {deadlines.length ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold">Deadline tuần này ({deadlines.length})</p>
          <ul className="mt-2 space-y-1 text-sm">{deadlines.map((item) => <li key={item.id}><a href="/study-planner/assignments" className="underline">{item.description}</a> <span className="text-slate-500">— hạn {item.dueDate}</span></li>)}</ul>
        </div>
      ) : null}
    </section>
  );
}
