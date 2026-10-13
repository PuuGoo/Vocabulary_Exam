import { getSession } from "@/lib/auth";
import { loadPlannerConnectionForUser, listPlannerCourses, listPlannerActivities } from "@/lib/studyPlanner/queries";
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

const WEEKDAY = ["", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"];
const COLS = [1, 2, 3, 4, 5, 6, 7] as const;

/** Slot boundaries every 30 minutes from 06:00 to 22:00, like the workbook grid. */
const SLOTS: number[] = [];
for (let minutes = 6 * 60; minutes < 22 * 60; minutes += 30) SLOTS.push(minutes / 1440);

function toMinutes(fraction: number | null | undefined): number | null {
  if (fraction == null || !Number.isFinite(fraction)) return null;
  return Math.round(((fraction % 1) + 1) % 1 * 1440);
}

/**
 * Route 5 — Lịch học (weekly timetable).
 *
 * A real timetable grid with days as columns and 30-minute rows, plus room and
 * course names and an explicit conflict cell when two sessions collide.
 */
export default async function PlannerSchedulePage() {
  const session = await getSession();
  const connection = session ? await loadPlannerConnectionForUser(session.userId) : null;
  if (!connection) {
    return (
      <section className="space-y-4">
        <PlannerPageHeader title="LỊCH HỌC HÀNG TUẦN" subtitle="Kết nối Study Planner để xem lịch học." />
        <PlannerEmpty title="Chưa kết nối Study Planner." body="Hãy kết nối Google Sheet ở Tổng quan trước khi xem lịch học." />
      </section>
    );
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
  const overlappingDays = new Set<number>();
  for (const day of COLS) {
    const slots = byDay.get(day) ?? [];
    for (let index = 1; index < slots.length; index += 1) {
      if (slots[index].startTime < slots[index - 1].endTime) overlappingDays.add(day);
    }
  }
  const totalHours = Math.round(sessions.reduce((sum, item) => sum + Math.max(0, (item.endTime - item.startTime) * 24), 0) * 10) / 10;
  const rooms = new Set(sessions.map((item) => item.room).filter(Boolean) as string[]);

  return (
    <section className="space-y-4">
      <PlannerPageHeader
        title="LỊCH HỌC HÀNG TUẦN"
        subtitle={hasTimetable ? `${sessions.length} buổi trong tuần · ${totalHours} giờ · ${rooms.size} phòng` : "Chưa có lịch học nào"}
      />

      <PlannerKpiStrip
        items={[
          { label: "Buổi / tuần", value: sessions.length },
          { label: "Số môn", value: courses.length },
          { label: "Tổng giờ", value: totalHours },
          { label: "Ngày có lớp", value: [...COLS].filter((day) => (byDay.get(day) ?? []).length > 0).length },
          { label: "Cảnh báo trùng giờ", value: overlappingDays.size, tone: overlappingDays.size ? "late" : "ok" },
        ]}
      />

      {overlappingDays.size ? (
        <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Có buổi học trùng giờ vào {[...overlappingDays].map((day) => WEEKDAY[day]).join(", ")}. Hãy kiểm tra lại thời khoá biểu.
        </p>
      ) : null}

      {hasTimetable ? (
        <>
          <PlannerSection title="Thời khoá biểu (30 phút / dòng)">
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[820px] table-fixed border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="w-[64px] border-b border-slate-200 bg-slate-50 px-2 py-2 text-slate-500">Giờ</th>
                    {COLS.map((day) => (
                      <th key={day} className="border-b border-l border-slate-200 bg-slate-50 px-2 py-2 text-center font-semibold text-slate-600">
                        {WEEKDAY[day]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SLOTS.map((slot) => {
                    const startMinutes = toMinutes(slot)!;
                    return (
                      <tr key={slot}>
                        <td className="border-b border-slate-100 bg-slate-50 px-2 py-1 text-center text-[11px] text-slate-500">
                          {formatClock(slot)}
                        </td>
                        {COLS.map((day) => {
                          const hits = (byDay.get(day) ?? []).filter((item) => {
                            const from = toMinutes(item.startTime);
                            const to = toMinutes(item.endTime);
                            if (from == null || to == null) return false;
                            const end = to <= from ? to + 1440 : to;
                            return startMinutes >= from && startMinutes < end;
                          });
                          const labels = [...new Set(hits.map((item) => `${courseName.get(item.courseId) ?? "Môn học"}${item.room ? ` (${item.room})` : ""}`))];
                          const conflict = labels.length > 1;
                          return (
                            <td
                              key={`${day}-${slot}`}
                              className={`border-b border-l border-slate-100 px-2 py-1 text-center text-[11px] ${
                                conflict ? "bg-red-50 font-semibold text-red-700" : labels.length ? "bg-[#e9eeff] font-medium text-[#1E3989]" : ""
                              }`}
                            >
                              {conflict ? "⚠ Trùng lịch" : labels[0] ?? ""}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </PlannerSection>

          <PlannerSection title="Danh sách buổi học">
            <PlannerTable columns={["Thứ", "Môn học", "Giờ", "Phòng", "Trạng thái"]} minWidth={640}>
              {COLS.flatMap((day) => (byDay.get(day) ?? []).map((item) => ({ day, item }))).map(({ day, item }) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 text-slate-600">{WEEKDAY[day]}</td>
                  <td className="px-3 py-2.5 font-medium text-slate-900">{courseName.get(item.courseId) ?? "Môn học"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">{formatClock(item.startTime)}–{formatClock(item.endTime)}</td>
                  <td className="px-3 py-2.5 text-slate-600">{item.room || "—"}</td>
                  <td className="px-3 py-2.5">
                    {overlappingDays.has(day) ? <PlannerPill tone="or">Có thể trùng giờ</PlannerPill> : <PlannerPill tone="ok">Bình thường</PlannerPill>}
                  </td>
                </tr>
              ))}
            </PlannerTable>
          </PlannerSection>
        </>
      ) : (
        <PlannerEmpty title="Chưa có lịch học nào." body="Nhập ở Sheet “Thông tin lớp học” — web sẽ tự cập nhật trong vài giây." />
      )}

      {activities.length ? (
        <PlannerSection title={`Hoạt động cá nhân (${activities.length})`}>
          <p className="text-sm text-slate-600">
            Có {activities.length} hoạt động đã ghi nhận — xem chi tiết và cảnh báo trùng lịch ở tab{" "}
            <a className="font-medium text-[#1E3989] underline" href="/study-planner/activities">Hoạt động</a> hoặc{" "}
            <a className="font-medium text-[#1E3989] underline" href="/study-planner/week">Lịch tuần</a>.
          </p>
        </PlannerSection>
      ) : null}
    </section>
  );
}
