import { getSession } from "@/lib/auth";
import { loadPlannerConnectionForUser, listPlannerCourses, listPlannerActivities } from "@/lib/studyPlanner/queries";

export const dynamic = "force-dynamic";

const WEEKDAY = ["", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"];
const COLS = [1, 2, 3, 4, 5, 6, 7] as const;

function formatTime(fraction: number): string {
  const total = Math.round(fraction * 24 * 60);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Route 5 — Lịch học (weekly timetable).
 *
 * A real timetable with days, slots, rooms and course names, plus a conflict
 * warning when two sessions overlap in the same time slot.
 */
export default async function PlannerSchedulePage() {
  const session = await getSession();
  const connection = session ? await loadPlannerConnectionForUser(session.userId) : null;
  if (!connection) {
    return <section className="space-y-4"><h1 className="text-2xl font-bold">Lịch học</h1><p className="text-sm text-muted">Hãy kết nối Study Planner để xem lịch học.</p></section>;
  }
  const [{ courses, sessions }, activities] = await Promise.all([
    listPlannerCourses(connection.id),
    listPlannerActivities(connection.id),
  ]);
  const courseName = new Map(courses.map((course) => [course.id, course.courseName]));
  const byDay = new Map<number, typeof sessions>();
  for (const day of COLS) byDay.set(day, []);
  for (const item of sessions) (byDay.get(item.weekday) ?? []).push(item);
  for (const day of COLS) byDay.get(day)!.sort((a, b) => a.startTime - b.startTime);

  const hasTimetable = sessions.length > 0;
  // Overlaps: when the next session of the day starts before the previous one ends.
  const overlappingDays = new Set<number>();
  for (const day of COLS) {
    const slots = byDay.get(day) ?? [];
    for (let index = 1; index < slots.length; index += 1) {
      if (slots[index].startTime < slots[index - 1].endTime) overlappingDays.add(day);
    }
  }
  return (
    <section className="space-y-4">
      <header><h1 className="text-2xl font-bold">Lịch học</h1><p className="text-sm text-muted">{hasTimetable ? `${sessions.length} buổi trong tuần` : "Chưa có lịch học nào"}</p></header>
      {hasTimetable ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {COLS.map((day) => (
            <div key={day} className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold text-slate-600">{WEEKDAY[day]}{overlappingDays.has(day) ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">Xung đột giờ</span> : null}</p>
              <ul className="mt-2 space-y-2">
                {(byDay.get(day) ?? []).length ? (
                  (byDay.get(day) ?? []).map((item) => (
                    <li key={item.id} className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-sm text-slate-700">{formatTime(item.startTime)}–{formatTime(item.endTime)}</p>
                      <p className="text-sm font-medium">{courseName.get(item.courseId) ?? "Môn học"}{item.room ? <span className="font-normal text-slate-500"> · {item.room}</span> : null}</p>
                    </li>
                  ))
                ) : (
                  <li className="py-1 text-xs text-slate-400">Không có buổi học</li>
                )}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">Chưa có lịch học nào. Nhập ở Sheet Thông tin lớp học — web sẽ tự cập nhật trong vài giây.</p>
      )}
      {activities.length ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600"><span className="font-semibold">{activities.length}</span> hoạt động đã có trong tuần này — xem thêm ở tab Lịch tuần.</p>
      ) : null}
    </section>
  );
}
