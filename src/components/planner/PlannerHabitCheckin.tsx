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

  const firstWeekday = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).getDay();
  const leadingBlanks = (firstWeekday + 6) % 7;

  return (
    <div className="mt-3">
      {/* Desktop: day grid that matches the workbook's month layout. */}
      <div className="hidden sm:block">
        <div className="grid grid-cols-7 gap-1">
          {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((label) => (
            <span key={label} className="text-center text-[10px] font-semibold text-slate-400">{label}</span>
          ))}
          {Array.from({ length: leadingBlanks }, (_, index) => (
            <span key={`pad-${index}`} />
          ))}
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
                className={`flex h-8 items-center justify-center rounded-lg border text-[11px] transition ${
                  active ? "border-emerald-500 bg-emerald-500 font-semibold text-white" : "border-slate-200 bg-white text-slate-500 hover:border-[#1E3989]"
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>
      {/* Mobile: a compact wrap beats a 31-column spreadsheet. */}
      <div className="flex flex-wrap gap-1.5 sm:hidden">
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
              className={`h-8 w-8 rounded-full border text-xs transition ${active ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-200 bg-white text-slate-600"}`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
