import { getSession } from "@/lib/auth";
import { loadPlannerConnectionForUser, listPlannerActivities } from "@/lib/studyPlanner/queries";
import { todayLocal } from "@/lib/studyPlanner/values";
import {
  PlannerEmpty,
  PlannerKpiStrip,
  PlannerMonthGrid,
  PlannerPageHeader,
  PlannerPill,
  PlannerSection,
  PlannerTable,
  formatClock,
} from "@/components/planner/PlannerShell";

export const dynamic = "force-dynamic";

const WEEKDAY = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];

function overlaps(left: { startTime: number | null; endTime: number | null }, right: { startTime: number | null; endTime: number | null }): boolean {
  if (left.startTime == null || left.endTime == null || right.startTime == null || right.endTime == null) return false;
  return left.startTime < right.endTime && right.startTime < left.endTime;
}

/**
 * Route 13 — Hoạt động. List plus a month calendar, with same-day overlap
 * warnings between activities so a double booking is visible immediately.
 */
export default async function PlannerActivitiesPage({ searchParams }: { searchParams: { month?: string } }) {
  const session = await getSession();
  const connection = session ? await loadPlannerConnectionForUser(session.userId) : null;
  if (!connection) {
    return (
      <section className="space-y-4">
        <PlannerPageHeader title="HOẠT ĐỘNG / SỰ KIỆN CÁ NHÂN" subtitle="Kết nối Study Planner để xem hoạt động." />
        <PlannerEmpty title="Chưa kết nối Study Planner." body="Hãy kết nối Google Sheet ở Tổng quan trước khi xem hoạt động." />
      </section>
    );
  }

  const month = /^\d{4}-\d{2}$/.test(searchParams.month ?? "") ? searchParams.month! : new Date().toISOString().slice(0, 7);
  const activities = await listPlannerActivities(connection.id, { from: `${month}-01`, to: `${month}-31` });
  const today = todayLocal();
  const monthStart = new Date(`${month}-01T00:00:00Z`);
  const daysInMonth = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)).getUTCDate();
  const leadingBlanks = (monthStart.getUTCDay() + 6) % 7;

  const byDay = new Map<string, typeof activities>();
  for (const activity of activities) byDay.set(activity.activityDate, [...(byDay.get(activity.activityDate) ?? []), activity]);

  const overlapping = new Set<string>();
  for (const [date, items] of byDay) {
    for (let a = 0; a < items.length; a += 1) {
      for (let b = a + 1; b < items.length; b += 1) {
        if (overlaps(items[a], items[b])) overlapping.add(date);
      }
    }
  }

  const totalHours = Math.round(activities.reduce((sum, item) => sum + (item.startTime != null && item.endTime != null ? Math.max(0, (item.endTime - item.startTime) * 24) : 0), 0) * 10) / 10;
  const byType = new Map<string, number>();
  for (const activity of activities) {
    const key = activity.activityType || "Khác";
    byType.set(key, (byType.get(key) ?? 0) + 1);
  }

  return (
    <section className="space-y-4">
      <PlannerPageHeader
        title="HOẠT ĐỘNG / SỰ KIỆN CÁ NHÂN"
        subtitle={`${activities.length} hoạt động trong tháng ${month} · ${totalHours} giờ`}
        actions={
          <form method="get" className="flex items-center gap-2">
            <input aria-label="Chọn tháng" type="month" name="month" defaultValue={month} className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-sm text-white" />
            <button type="submit" className="rounded-xl bg-white px-3.5 py-2 text-sm font-semibold text-[#1E3989]">Xem</button>
          </form>
        }
      />

      <PlannerKpiStrip
        items={[
          { label: "Hoạt động", value: activities.length },
          { label: "Tổng giờ", value: totalHours },
          { label: "Loại hoạt động", value: byType.size },
          { label: "Ngày có trùng giờ", value: overlapping.size, tone: overlapping.size ? "or" : "ok" },
        ]}
      />

      {overlapping.size ? (
        <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Có hoạt động trùng giờ vào {[...overlapping].sort().join(", ")}. Hãy kiểm tra lại lịch.
        </p>
      ) : null}

      {activities.length ? (
        <>
          <PlannerSection title={`Lịch tháng ${month}`}>
            <PlannerMonthGrid
              month={month}
              daysInMonth={daysInMonth}
              leadingBlanks={leadingBlanks}
              today={today}
              render={(iso) => {
                const items = byDay.get(iso) ?? [];
                if (!items.length) return null;
                return (
                  <>
                    {items.slice(0, 2).map((item) => (
                      <p key={item.id} className="truncate text-[10px] text-slate-700">{item.activityName}</p>
                    ))}
                    {items.length > 2 ? <p className="text-[10px] text-slate-500">+{items.length - 2}</p> : null}
                    {overlapping.has(iso) ? <span className="text-[10px] font-semibold text-amber-700">⚠ trùng giờ</span> : null}
                  </>
                );
              }}
            />
          </PlannerSection>

          <PlannerSection title="Danh sách hoạt động">
            <PlannerTable columns={["Ngày", "Thứ", "Giờ", "Hoạt động", "Loại", "Cảnh báo", "Ghi chú"]} minWidth={960}>
              {activities.map((activity) => (
                <tr key={activity.id} className="align-top hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">{activity.activityDate}</td>
                  <td className="px-3 py-2.5 text-slate-600">{WEEKDAY[new Date(`${activity.activityDate}T00:00:00Z`).getUTCDay()]}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                    {activity.startTime != null ? `${formatClock(activity.startTime)}${activity.endTime != null ? `–${formatClock(activity.endTime)}` : ""}` : "—"}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-slate-900">{activity.activityName}</td>
                  <td className="px-3 py-2.5">
                    {activity.activityType ? <PlannerPill tone="prog">{activity.activityType}</PlannerPill> : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {overlapping.has(activity.activityDate) ? <PlannerPill tone="or">⚠ Trùng lịch</PlannerPill> : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="max-w-[240px] px-3 py-2.5 text-slate-500">{activity.notes || ""}</td>
                </tr>
              ))}
            </PlannerTable>
          </PlannerSection>

          <PlannerSection title="Phân loại hoạt động">
            <div className="flex flex-wrap gap-2">
              {[...byType.entries()].sort((left, right) => right[1] - left[1]).map(([type, count]) => (
                <PlannerPill key={type} tone="navy">{type} · {count}</PlannerPill>
              ))}
            </div>
          </PlannerSection>
        </>
      ) : (
        <PlannerEmpty title="Chưa có hoạt động nào trong tháng này." body="Nhập trong Sheet “Hoạt động”, web sẽ tự cập nhật." />
      )}
    </section>
  );
}
