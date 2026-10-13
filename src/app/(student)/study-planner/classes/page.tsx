import { getSession } from "@/lib/auth";
import { loadPlannerConnectionForUser, listPlannerCourses } from "@/lib/studyPlanner/queries";
import {
  PlannerBar,
  PlannerEmpty,
  PlannerKpiStrip,
  PlannerPageHeader,
  PlannerPill,
  PlannerSection,
  PlannerTable,
  formatClock,
} from "@/components/planner/PlannerShell";

export const dynamic = "force-dynamic";

const WEEKDAY = ["", "T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function grade10To4(score: number): number {
  if (score >= 8.5) return 4;
  if (score >= 8) return 3.5;
  if (score >= 7) return 3;
  if (score >= 6.5) return 2.5;
  if (score >= 5.5) return 2;
  if (score >= 5) return 1.5;
  if (score >= 4) return 1;
  return 0;
}

function rank(score: number): { label: string; tone: "ok" | "prog" | "or" | "late" } {
  if (score >= 8) return { label: "Giỏi", tone: "ok" };
  if (score >= 6.5) return { label: "Khá", tone: "prog" };
  if (score >= 5) return { label: "Trung bình", tone: "or" };
  return { label: "Yếu", tone: "late" };
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
    return (
      <section className="space-y-4">
        <PlannerPageHeader title="THÔNG TIN LỚP HỌC" subtitle="Kết nối Study Planner để xem lớp học." />
        <PlannerEmpty title="Chưa kết nối Study Planner." body="Hãy kết nối Google Sheet ở Tổng quan trước khi xem lớp học." />
      </section>
    );
  }

  const { courses, sessions } = await listPlannerCourses(connection.id);
  const sessionsByCourse = new Map<number, typeof sessions>();
  for (const item of sessions) {
    const list = sessionsByCourse.get(item.courseId) ?? [];
    list.push(item);
    sessionsByCourse.set(item.courseId, list);
  }
  for (const list of sessionsByCourse.values()) list.sort((left, right) => left.weekday - right.weekday || left.startTime - right.startTime);

  const scored = courses.map((course) => Number(course.score)).filter((value) => Number.isFinite(value));
  const credits = courses.reduce((sum, course) => sum + (course.credits ?? 0), 0);
  const gpa10 = scored.length ? scored.reduce((sum, value) => sum + value, 0) / scored.length : null;
  const gpa4 = scored.length ? scored.reduce((sum, value) => sum + grade10To4(value), 0) / scored.length : null;

  return (
    <section className="space-y-4">
      <PlannerPageHeader
        title="THÔNG TIN LỚP HỌC"
        subtitle={`${courses.length} môn · ${credits} tín chỉ${gpa10 != null ? ` · GPA ${gpa10.toFixed(2)}/10` : ""}`}
      />

      <PlannerKpiStrip
        items={[
          { label: "Số môn học", value: courses.length },
          { label: "Tổng tín chỉ", value: credits },
          { label: "GPA hệ 10", value: gpa10 != null ? gpa10.toFixed(2) : "—" },
          { label: "GPA hệ 4", value: gpa4 != null ? gpa4.toFixed(2) : "—", progress: gpa4 != null ? (gpa4 / 4) * 100 : undefined },
          { label: "Xếp loại", value: gpa10 != null ? rank(gpa10).label : "—" },
        ]}
      />

      {courses.length ? (
        <>
          <PlannerSection title="Danh sách môn học">
            <PlannerTable columns={["Môn học", "Mã môn", "Giảng viên", "Tín chỉ", "Điểm (hệ 10)", "Điểm (hệ 4)", "Xếp loại", "Ghi chú"]} minWidth={980}>
              {courses.map((course) => {
                const score = Number(course.score);
                const hasScore = Number.isFinite(score);
                const grade = hasScore ? rank(score) : null;
                return (
                  <tr key={course.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-semibold text-slate-900">{course.courseName}</td>
                    <td className="px-3 py-2.5 text-slate-600">{course.courseCode || "—"}</td>
                    <td className="px-3 py-2.5 text-slate-600">{course.lecturer || "—"}</td>
                    <td className="px-3 py-2.5 text-slate-600">{course.credits ?? "—"}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-800">{hasScore ? course.score : "—"}</td>
                    <td className="px-3 py-2.5 text-slate-600">{hasScore ? grade10To4(score).toFixed(1) : "—"}</td>
                    <td className="px-3 py-2.5">{grade ? <PlannerPill tone={grade.tone}>{grade.label}</PlannerPill> : <span className="text-slate-400">—</span>}</td>
                    <td className="max-w-[220px] px-3 py-2.5 text-slate-500">{course.notes || ""}</td>
                  </tr>
                );
              })}
            </PlannerTable>
          </PlannerSection>

          <PlannerSection title="Lịch học hàng tuần">
            {sessions.length ? (
              <PlannerTable columns={["Môn học", "Thứ", "Giờ", "Phòng"]} minWidth={560}>
                {sessions.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-medium text-slate-900">{courses.find((course) => course.id === item.courseId)?.courseName ?? "Môn học"}</td>
                    <td className="px-3 py-2.5 text-slate-600">{WEEKDAY[item.weekday] ?? "?"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">{formatClock(item.startTime)}–{formatClock(item.endTime)}</td>
                    <td className="px-3 py-2.5 text-slate-600">{item.room || "—"}</td>
                  </tr>
                ))}
              </PlannerTable>
            ) : (
              <p className="text-sm text-slate-500">Chưa có lịch học. Nhập ở tab Thông tin lớp học trong Sheet.</p>
            )}
          </PlannerSection>

          <PlannerSection title="Tiến độ tín chỉ theo môn">
            <div className="space-y-3">
              {courses.map((course) => {
                const list = sessionsByCourse.get(course.id) ?? [];
                const share = credits ? ((course.credits ?? 0) / credits) * 100 : 0;
                return (
                  <div key={course.id} className="flex flex-wrap items-center gap-3">
                    <span className="w-[220px] flex-none truncate text-sm text-slate-700">{course.courseName}</span>
                    <div className="min-w-[120px] flex-1">
                      <PlannerBar value={share} />
                    </div>
                    <span className="w-[110px] flex-none text-right text-xs text-slate-500">
                      {course.credits ?? 0} tín chỉ · {list.length} buổi
                    </span>
                  </div>
                );
              })}
            </div>
          </PlannerSection>
        </>
      ) : (
        <PlannerEmpty title="Chưa có môn học nào." body="Nhập trong Sheet “Thông tin lớp học”, web sẽ tự cập nhật." />
      )}
    </section>
  );
}
