"use client";

import { useState } from "react";

/**
 * Habit check-in. Identity is (habit, real date), never the grid cell position,
 * so a habit inserted mid-month keeps its whole history.
 */
export default function PlannerHabitCheckin({
  habitId,
  month,
  daysInMonth,
  completed,
}: {
  habitId: number;
  month: string;
  daysInMonth: number;
  completed: string[];
}) {
  const [done, setDone] = useState<Set<string>>(() => new Set(completed));
  const [pending, setPending] = useState(false);

  async function toggle(day: number) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    const next = !done.has(date);
    setPending(true);
    const previous = done;
    const updated = new Set(done);
    if (next) updated.add(date);
    else updated.delete(date);
    setDone(updated);
    try {
      const response = await fetch("/api/study-planner/habits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ habitId, date, completed: next }),
      });
      if (!response.ok) setDone(previous);
    } catch {
      setDone(previous);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-3">
      <div className="hidden gap-1 overflow-x-auto pb-1 sm:grid sm:grid-cols-[repeat(auto-fit,minmax(28px,1fr))]">
        {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => {
          const date = `${month}-${String(day).padStart(2, "0")}`;
          const active = done.has(date);
          return (
            <button
              key={day}
              type="button"
              disabled={pending}
              onClick={() => void toggle(day)}
              aria-pressed={active}
              aria-label={`Ngày ${day}`}
              className={`flex h-7 w-full min-w-[28px] items-center justify-center rounded-md border text-[10px] ${active ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-200 bg-white text-slate-500"}`}
            >
              {day}
            </button>
          );
        })}
      </div>
      {/* Mobile: a compact list beats a 31-column spreadsheet. */}
      <div className="flex flex-wrap gap-1 sm:hidden">
        {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => {
          const date = `${month}-${String(day).padStart(2, "0")}`;
          const active = done.has(date);
          return (
            <button
              key={day}
              type="button"
              disabled={pending}
              onClick={() => void toggle(day)}
              aria-pressed={active}
              className={`h-8 w-8 rounded-full border text-xs ${active ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-200 bg-white text-slate-600"}`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
