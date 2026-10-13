import { getSession } from "@/lib/auth";
import { loadPlannerConnectionForUser, listPlannerHabits } from "@/lib/studyPlanner/queries";
import { todayLocal } from "@/lib/studyPlanner/values";
import PlannerHabitCheckin from "@/components/planner/PlannerHabitCheckin";
import {
  PlannerBar,
  PlannerEmpty,
  PlannerKpiStrip,
  PlannerPageHeader,
  PlannerPill,
  PlannerSection,
} from "@/components/planner/PlannerShell";

export const dynamic = "force-dynamic";

/**
 * Route 11 — Habit Tracker.
 *
 * Monthly habit tracker keyed by (habit, date). Desktop reads as a calendar
 * grid; mobile leans on the compact per-habit day list so nobody has to pan a
 * 31-column spreadsheet on a phone.
 */
export default async function PlannerHabitsPage({ searchParams }: { searchParams: { month?: string } }) {
  const session = await getSession();
  const connection = session ? await loadPlannerConnectionForUser(session.userId) : null;
  if (!connection) {
    return (
      <section className="space-y-4">
        <PlannerPageHeader title="THEO DÕI THÓI QUEN" subtitle="Kết nối Study Planner để theo dõi thói quen." />
        <PlannerEmpty title="Chưa kết nối Study Planner." body="Hãy kết nối Google Sheet ở Tổng quan trước khi theo dõi thói quen." />
      </section>
    );
  }

  const month = /^\d{4}-\d{2}$/.test(searchParams.month ?? "") ? searchParams.month! : new Date().toISOString().slice(0, 7);
  const { habits, completions } = await listPlannerHabits(connection.id, month);
  const today = todayLocal();
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const todayDay = today.startsWith(month) ? Number(today.slice(8, 10)) : null;

  const completedByHabit = new Map<number, Set<string>>();
  for (const done of completions) {
    if (!done.completed) continue;
    const days = completedByHabit.get(done.habitId) ?? new Set<string>();
    days.add(done.completionDate);
    completedByHabit.set(done.habitId, days);
  }

  const totalCheckins = [...completedByHabit.values()].reduce((sum, days) => sum + days.size, 0);
  const doneToday = todayDay == null ? 0 : habits.filter((habit) => completedByHabit.get(habit.id)?.has(today)).length;
  const monthProgress = habits.length ? Math.round((totalCheckins / (habits.length * daysInMonth)) * 100) : 0;

  // Daily density, the "Cây xanh mỗi ngày" row in the workbook.
  const dailyDensity = Array.from({ length: daysInMonth }, (_, index) => {
    const iso = `${month}-${String(index + 1).padStart(2, "0")}`;
    const hits = habits.filter((habit) => completedByHabit.get(habit.id)?.has(iso)).length;
    return { iso, hits, share: habits.length ? hits / habits.length : 0 };
  });

  return (
    <section className="space-y-4">
      <PlannerPageHeader
        title="THEO DÕI THÓI QUEN"
        subtitle={`${habits.length} thói quen · tháng ${month} · ${totalCheckins} lượt hoàn thành`}
        actions={
          <form method="get" className="flex items-center gap-2">
            <input aria-label="Chọn tháng" type="month" name="month" defaultValue={month} className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-sm text-white" />
            <button type="submit" className="rounded-xl bg-white px-3.5 py-2 text-sm font-semibold text-[#1E3989]">Xem</button>
          </form>
        }
      />

      <PlannerKpiStrip
        items={[
          { label: "Thói quen", value: habits.length },
          { label: "Lượt hoàn thành", value: totalCheckins },
          { label: "Hôm nay", value: `${doneToday}/${habits.length}` },
          { label: "Tỷ lệ cả tháng", value: `${monthProgress}%`, progress: monthProgress, tone: "ok" },
        ]}
      />

      {habits.length ? (
        <>
          <PlannerSection title="Mật độ hoàn thành theo ngày">
            <div className="flex flex-wrap gap-1">
              {dailyDensity.map((day) => (
                <span
                  key={day.iso}
                  title={`${day.iso}: ${day.hits}/${habits.length}`}
                  className={`grid h-7 w-7 place-items-center rounded-md text-[10px] ${
                    day.share >= 0.8 ? "bg-emerald-500 text-white" : day.share > 0 ? "bg-emerald-200 text-emerald-900" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {Number(day.iso.slice(8, 10))}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">Ô đậm = nhiều thói quen hoàn thành trong ngày đó.</p>
          </PlannerSection>

          {habits.map((habit) => {
            const days = completedByHabit.get(habit.id) ?? new Set<string>();
            const completion = Math.round((days.size / Math.max(1, daysInMonth)) * 100);
            return (
              <PlannerSection
                key={habit.id}
                title={habit.name}
                actions={
                  <>
                    <PlannerPill tone={completion >= 80 ? "ok" : completion >= 40 ? "prog" : "mute"}>
                      {days.size}/{daysInMonth} ngày · {completion}%
                    </PlannerPill>
                  </>
                }
              >
                <PlannerBar value={completion} tone={completion >= 80 ? "ok" : "navy"} />
                <PlannerHabitCheckin habitId={habit.id} month={month} daysInMonth={daysInMonth} completed={[...days]} />
              </PlannerSection>
            );
          })}
        </>
      ) : (
        <PlannerEmpty title="Chưa có thói quen nào trong tháng này." body="Thêm thói quen ở tab Habit Tracker trong Sheet của bạn." />
      )}
    </section>
  );
}
