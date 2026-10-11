import { getSession } from "@/lib/auth";
import { loadPlannerConnectionForUser, listPlannerHabits } from "@/lib/studyPlanner/queries";
import PlannerHabitCheckin from "@/components/planner/PlannerHabitCheckin";

export const dynamic = "force-dynamic";

/**
 * Route 11 — Habit Tracker.
 *
 * Monthly habit tracker keyed by (habit, date). Desktop reads as a scrollable
 * grid; mobile leans on the compact per-habit day list below so nobody has to
 * pan a 31-column spreadsheet on a phone.
 */
export default async function PlannerHabitsPage({ searchParams }: { searchParams: { month?: string } }) {
  const session = await getSession();
  const connection = session ? await loadPlannerConnectionForUser(session.userId) : null;
  if (!connection) {
    return <section className="space-y-4"><h1 className="text-2xl font-bold">Thói quen</h1><p className="text-sm text-muted">Hãy kết nối Study Planner để theo dõi thói quen.</p></section>;
  }
  const month = /^\d{4}-\d{2}$/.test(searchParams.month ?? "") ? searchParams.month! : new Date().toISOString().slice(0, 7);
  const { habits, completions } = await listPlannerHabits(connection.id, month);
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const completedByHabit = new Map<number, Set<string>>();
  for (const done of completions) {
    if (!done.completed) continue;
    const days = completedByHabit.get(done.habitId) ?? new Set<string>();
    days.add(done.completionDate);
    completedByHabit.set(done.habitId, days);
  }
  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-2xl font-bold">Habit Tracker</h1><p className="text-sm text-muted">{habits.length} thói quen trong tháng {month}</p></div>
        <form method="get" className="flex items-center gap-2">
          <input aria-label="Chọn tháng" type="month" name="month" defaultValue={month} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
          <button type="submit" className="rounded-xl bg-slate-100 px-3 py-2 text-sm">Xem</button>
        </form>
      </header>
      {habits.length ? (
        <div className="space-y-3">
          {habits.map((habit) => {
            const days = completedByHabit.get(habit.id) ?? new Set<string>();
            const completion = Math.round((days.size / Math.max(1, daysInMonth)) * 100);
            return (
              <div key={habit.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">{habit.name}</p>
                  <p className="text-sm text-slate-600">{days.size}/{daysInMonth} ngày ({completion}%)</p>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-2 bg-emerald-500" style={{ width: `${completion}%` }} /></div>
                <PlannerHabitCheckin habitId={habit.id} month={month} daysInMonth={daysInMonth} completed={[...days]} />
              </div>
            );
          })}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">Chưa có thói quen nào trong tháng này — thêm ở Habit Tracker trong Sheet của bạn.</p>
      )}
    </section>
  );
}
