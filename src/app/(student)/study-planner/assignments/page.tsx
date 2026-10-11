import { getSession } from "@/lib/auth";
import { loadPlannerConnectionForUser, listPlannerAssignments } from "@/lib/studyPlanner/queries";
import { todayLocal } from "@/lib/studyPlanner/values";

export const dynamic = "force-dynamic";

function formatTime(fraction: number | null): string {
  if (fraction == null || !Number.isFinite(fraction)) return "";
  const total = Math.round(fraction * 24 * 60);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function dueState(dueDate: string | null, today: string): "overdue" | "soon" | "normal" | "none" {
  if (!dueDate) return "none";
  if (dueDate < today) return "overdue";
  const diff = (new Date(`${dueDate}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000;
  return diff <= 3 ? "soon" : "normal";
}

/**
 * Route 8 — Bài tập & deadline (list + monthly calendar).
 *
 * Combines "Bảng theo dõi bài tập" and "Lịch bài tập" as one view: a table of
 * real rows plus a month grid of deadlines. Overdue and due-soon states are
 * explicit, and every cell derives from the same underlying records.
 */
export default async function PlannerAssignmentsPage({ searchParams }: { searchParams: { month?: string } }) {
  const session = await getSession();
  const connection = session ? await loadPlannerConnectionForUser(session.userId) : null;
  if (!connection) {
    return <section className="space-y-4"><h1 className="text-2xl font-bold">Bài tập & deadline</h1><p className="text-sm text-muted">Hãy kết nối Study Planner để xem bài tập.</p></section>;
  }
  const assignments = await listPlannerAssignments(connection.id);
  const today = todayLocal();
  const month = /^\d{4}-\d{2}$/.test(searchParams.month ?? "") ? searchParams.month! : today.slice(0, 7);
  const monthStart = new Date(`${month}-01T00:00:00Z`);
  const daysInMonth = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)).getUTCDate();
  const byDay = new Map<string, typeof assignments>();
  for (const item of assignments) {
    if (!item.dueDate || !item.dueDate.startsWith(month)) continue;
    byDay.set(item.dueDate, [...(byDay.get(item.dueDate) ?? []), item]);
  }
  const counts = { overdue: 0, soon: 0 };
  for (const item of assignments) {
    const state = dueState(item.dueDate, today);
    if (state === "overdue") counts.overdue += 1;
    if (state === "soon") counts.soon += 1;
  }
  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-2xl font-bold">Bài tập & deadline</h1><p className="text-sm text-muted">{assignments.length} bài · <span className="text-red-600">{counts.overdue} quá hạn</span> · {counts.soon} sắp đến hạn</p></div>
        <form method="get" className="flex items-center gap-2">
          <input aria-label="Chọn tháng" type="month" name="month" defaultValue={month} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
          <button type="submit" className="rounded-xl bg-slate-100 px-3 py-2 text-sm">Xem</button>
        </form>
      </header>
      {assignments.length ? (
        <>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-3 py-2">Môn</th><th className="px-3 py-2">Mô tả</th><th className="px-3 py-2">Phân loại</th><th className="px-3 py-2">Trạng thái</th><th className="px-3 py-2">Thời lượng</th><th className="px-3 py-2">Hạn nộp</th><th className="px-3 py-2">Điểm</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assignments.map((item) => {
                  const state = dueState(item.dueDate, today);
                  return (
                    <tr key={item.id}>
                      <td className="px-3 py-2">{item.subject ?? "—"}</td>
                      <td className="px-3 py-2 font-medium">{item.description}{item.notes ? <span className="block text-xs text-slate-500">{item.notes}</span> : null}</td>
                      <td className="px-3 py-2">{item.category ?? "—"}</td>
                      <td className="px-3 py-2">{item.statusText ?? "—"}</td>
                      <td className="px-3 py-2">{item.durationHours != null ? `${item.durationHours}h` : "—"}</td>
                      <td className={`px-3 py-2 ${state === "overdue" ? "font-semibold text-red-600" : state === "soon" ? "font-semibold text-amber-700" : ""}`}>{item.dueDate ? `${item.dueDate}${item.dueTime != null ? ` ${formatTime(item.dueTime)}` : ""}` : "—"}</td>
                      <td className="px-3 py-2">{item.grade ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold">Lịch deadline tháng {month}</p>
            <div className="mt-2 grid grid-cols-7 gap-1 text-xs">
              {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((label) => <span key={label} className="text-center font-semibold text-slate-500">{label}</span>)}
              {Array.from({ length: ((monthStart.getUTCDay() + 6) % 7) }, (_, index) => <span key={`pad-${index}`} />)}
              {Array.from({ length: daysInMonth }, (_, index) => {
                const day = String(index + 1).padStart(2, "0");
                const iso = `${month}-${day}`;
                const dayItems = byDay.get(iso) ?? [];
                return (
                  <div key={iso} className={`min-h-[52px] rounded-lg border p-1 ${dayItems.length ? "border-amber-300 bg-amber-50" : "border-slate-100"}`}>
                    <span className="text-[10px] text-slate-500">{index + 1}</span>
                    {dayItems.slice(0, 2).map((item) => <p key={item.id} className="truncate text-[10px] text-slate-700">{item.description}</p>)}
                    {dayItems.length > 2 ? <p className="text-[10px] text-slate-500">+{dayItems.length - 2}</p> : null}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">Chưa có bài tập nào.</p>
      )}
    </section>
  );
}
