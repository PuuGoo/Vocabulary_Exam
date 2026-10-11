import { getSession } from "@/lib/auth";
import { loadPlannerConnectionForUser, listPlannerCourses } from "@/lib/studyPlanner/queries";

export const dynamic = "force-dynamic";

const WEEKDAY = ["", "T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function formatTime(fraction: number | null | undefined): string {
  if (fraction == null || !Number.isFinite(fraction)) return "—";
  const total = Math.round(fraction * 24 * 60);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Route 4 — Thông tin lớp học.
 *
 * Semester info, course management, weekly sessions, and GPA from editable
 * scores only. Derived values are read-only unless the workbook allows edits.
 */
export default async function PlannerClassesPage() {
  const session = await getSession();
  const connection = session ? await loadPlannerConnectionForUser(session.userId) : null;
  if (!connection) {
    return <section className="space-y-4"><h1 className="text-2xl font-bold">Thông tin lớp học</h1><p className="text-sm text-muted">Hãy kết nối Study Planner để xem lớp học.</p></section>;
  }
  const { courses, sessions } = await listPlannerCourses(connection.id);
  const sessionsByCourse = new Map<number, typeof sessions>();
  for (const item of sessions) {
    const list = sessionsByCourse.get(item.courseId) ?? [];
    list.push(item);
    sessionsByCourse.set(item.courseId, list);
  }
  const scored = courses.map((course) => Number(course.score)).filter((value) => Number.isFinite(value));
  const gpa = scored.length ? (scored.reduce((sum, value) => sum + value, 0) / scored.length).toFixed(2) : null;
  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Thông tin lớp học</h1>
        <p className="text-sm text-muted">{courses.length} môn{courses.length ? ` · GPA ${gpa}` : ""}</p>
      </header>
      {courses.length ? (
        <ul className="space-y-3">
          {courses.map((course) => (
            <li key={course.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">{course.courseName} {course.courseCode ? <span className="text-sm font-normal text-slate-500">· {course.courseCode}</span> : null}</p>
                <p className="text-sm text-slate-600">{course.score != null ? `Điểm ${course.score}` : "Chưa nhập điểm"}{course.credits != null ? ` · ${course.credits} tín chỉ` : ""}</p>
              </div>
              {course.lecturer || course.notes ? <p className="mt-1 text-sm text-slate-600">{[course.lecturer, course.notes].filter(Boolean).join(" · ")}</p> : null}
              {(sessionsByCourse.get(course.id) ?? []).length ? (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {(sessionsByCourse.get(course.id) ?? []).map((item) => (
                    <li key={item.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{WEEKDAY[item.weekday] ?? "?"} {formatTime(item.startTime)}–{formatTime(item.endTime)}{item.room ? ` · ${item.room}` : ""}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">Chưa có môn học nào. Nhập trong Sheet Thông tin lớp học, web sẽ tự cập nhật.</p>
      )}
    </section>
  );
}
