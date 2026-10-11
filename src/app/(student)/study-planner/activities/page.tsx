import { getSession } from "@/lib/auth";
import { loadPlannerConnectionForUser, listPlannerActivities } from "@/lib/studyPlanner/queries";

export const dynamic = "force-dynamic";

function formatTime(fraction: number | null): string {
  if (fraction == null || !Number.isFinite(fraction)) return "";
  const total = Math.round(fraction * 24 * 60);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Route 13 — Hoạt động. List plus a month calendar, with same-day overlap
 * warnings between activities so a double booking is visible immediately.
 */
export default async function PlannerActivitiesPage({ searchParams }: { searchParams: { month?: string } }) {
  const session = await getSession();
  const connection = session ? await loadPlannerConnectionForUser(session.userId) : null;
  if (!connection) {
    return <section className="space-y-4"><h1 className="text-2xl font-bold">Hoạt động</h1><p className="text-sm text-muted">Hãy kết nối Study Planner để xem hoạt động.</p></section>;
  }
  const month = /^\d{4}-\d{2}$/.test(searchParams.month ?? "") ? searchParams.month! : new Date().toISOString().slice(0, 7);
  const activities = await listPlannerActivities(connection.id, { from: `${month}-01`, to: `${month}-31` });
  const monthStart = new Date(`${month}-01T00:00:00Z`);
  const daysInMonth = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)).getUTCDate();
  const byDay = new Map<string, typeof activities>();
  for (const activity of activities) byDay.set(activity.activityDate, [...(byDay.get(activity.activityDate) ?? []), activity]);
  const overlapping = new Set<string>();
  for (const [date, items] of byDay) {
    for (let a = 0; a < items.length; a += 1) {
      for (let b = a + 1; b < items.length; b += 1) {
        const left = items[a];
        const right = items[b];
        if (left.startTime != null && left.endTime != null && right.startTime != null && right.endTime != null && left.startTime < right.endTime && right.startTime < left.endTime) overlapping.add(date);
      }
    }
  }
  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-2xl font-bold">Hoạt động</h1><p className="text-sm text-muted">{activities.length} hoạt động trong tháng {month}</p></div>
        <form method="get" className="flex items-center gap-2"><input aria-label="Chọn tháng" type="month" name="month" defaultValue={month} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" /><button type="submit" className="rounded-xl bg-slate-100 px-3 py-2 text-sm">Xem</button></form>
      </header>
      {overlapping.size ? <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">Có hoạt động trùng giờ vào {[...overlapping].join(", ")}.</p> : null}
      {activities.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <ul className="space-y-2">
            {activities.map((activity) => (
              <li key={activity.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-sm font-medium">{activity.activityName}</p>
                <p className="text-xs text-slate-500">{activity.activityDate}{activity.startTime != null ? ` ${formatTime(activity.startTime)}${activity.endTime != null ? `–${formatTime(activity.endTime)}` : ""}` : ""}{activity.activityType ? ` · ${activity.activityType}` : ""}{activity.notes ? ` · ${activity.notes}` : ""}</p>
              </li>
            ))}
          </ul>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold">Lịch tháng {month}</p>
            <div className="mt-2 grid grid-cols-7 gap-1 text-xs">
              {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((label) => <span key={label} className="text-center font-semibold text-slate-500">{label}</span>)}
              {Array.from({ length: (monthStart.getUTCDay() + 6) % 7 }, (_, index) => <span key={`pad-${index}`} />)}
              {Array.from({ length: daysInMonth }, (_, index) => {
                const iso = `${month}-${String(index + 1).padStart(2, "0")}`;
                const items = byDay.get(iso) ?? [];
                return <div key={iso} className={`min-h-[46px] rounded-lg border p-1 ${items.length ? "border-indigo-300 bg-indigo-50" : "border-slate-100"}`}><span className="text-[10px] text-slate-500">{index + 1}</span>{items.slice(0, 2).map((item) => <p key={item.id} className="truncate text-[10px] text-slate-700">{item.activityName}</p>)}</div>;
              })}
            </div>
          </div>
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">Chưa có hoạt động nào trong tháng này.</p>
      )}
    </section>
  );
}
