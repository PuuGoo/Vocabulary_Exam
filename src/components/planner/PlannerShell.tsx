import type { ReactNode } from "react";

/**
 * Shared Study Planner shell — the single source of the Lexora planner look.
 *
 * Every planner route composes these pieces so the journal, dashboard, classes,
 * schedule, habits… all read as one product instead of thirteen CRUD screens.
 * Tokens mirror the approved design file: navy #1E3989, ink #141a33,
 * mute #626a89, line #e4e8f2, soft #e9eeff and the ok/late/or/prog families.
 */

export const PLANNER_NAVY = "#1E3989";
export const PLANNER_NAVY_DARK = "#17306f";

export type PlannerTone = "ok" | "late" | "or" | "prog" | "mute" | "navy";

const PILL_TONES: Record<PlannerTone, string> = {
  ok: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  late: "bg-red-50 text-red-700 ring-red-200",
  or: "bg-amber-50 text-amber-800 ring-amber-200",
  prog: "bg-[#e9eeff] text-[#1d40ad] ring-[#cdd8ff]",
  mute: "bg-slate-100 text-slate-600 ring-slate-200",
  navy: "bg-[#1E3989] text-white ring-[#1E3989]",
};

/** Rounded status pill used in tables, cards and headers. */
export function PlannerPill({ tone = "mute", children }: { tone?: PlannerTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${PILL_TONES[tone]}`}>
      {children}
    </span>
  );
}

/** Coloured priority dot + label, matching the sheet's priority marker. */
export function PlannerPriority({ value }: { value: string | null | undefined }) {
  const raw = (value ?? "").trim();
  if (!raw) return <span className="text-slate-400">—</span>;
  const lower = raw.toLowerCase();
  const dot = lower.includes("khẩn") || lower === "urgent" || lower === "high"
    ? "bg-red-500"
    : lower === "cao"
      ? "bg-amber-500"
      : lower === "thấp" || lower === "low"
        ? "bg-slate-400"
        : "bg-sky-500";
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <i className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
      {raw}
    </span>
  );
}

/** Thin progress bar (0..100). */
export function PlannerBar({ value, tone = "navy" }: { value: number; tone?: "navy" | "ok" | "or" | "late" }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const fill = tone === "ok" ? "bg-emerald-500" : tone === "or" ? "bg-amber-500" : tone === "late" ? "bg-red-500" : "bg-[#1E3989]";
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${fill} transition-all`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

/** Navy page banner: title, one-line context, optional right-hand actions. */
export function PlannerPageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="overflow-hidden rounded-2xl bg-[#1E3989] px-5 py-5 text-white shadow-sm sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold tracking-wide">{title}</h1>
          {subtitle ? <p className="mt-1 max-w-3xl text-sm text-white/75">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export type PlannerKpi = { label: string; value: ReactNode; hint?: ReactNode; progress?: number; tone?: "navy" | "ok" | "or" | "late" };

/** KPI ribbon: 2 columns on phones, up to 5 on desktop. */
export function PlannerKpiStrip({ items }: { items: PlannerKpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => (
        <div key={item.label} className="lexora-card border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{item.label}</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">{item.value}</p>
          {item.progress != null ? <div className="mt-2"><PlannerBar value={item.progress} tone={item.tone ?? "navy"} /></div> : null}
          {item.hint ? <p className="mt-1 text-xs text-slate-500">{item.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}

/** Filter bar container: search, selects, actions in one row that wraps. */
export function PlannerToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="lexora-card border-slate-200 bg-white p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export const PLANNER_INPUT = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800";

/** Search box with the magnifier affordance used across planner pages. */
export function PlannerSearch({ children }: { children: ReactNode }) {
  return (
    <label className="flex min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3">
      <span aria-hidden="true" className="text-slate-400">⌕</span>
      {children}
    </label>
  );
}

export const PLANNER_SEARCH_INPUT = "min-w-0 flex-1 border-0 bg-transparent py-2 text-sm text-slate-800 outline-none";

/** Count chip row (Tất cả / Cần làm / …). */
export function PlannerChips({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

export function PlannerChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
        active ? "border-[#1E3989] bg-[#1E3989] text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {label}
      {count != null ? <span className="ml-1.5 text-xs opacity-80">{count}</span> : null}
    </button>
  );
}

export function PlannerPrimaryButton({ children, onClick, type = "button", disabled }: { children: ReactNode; onClick?: () => void; type?: "button" | "submit"; disabled?: boolean }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl bg-[#1E3989] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#17306f] disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function PlannerGhostButton({ children, onClick, href, type = "button" }: { children: ReactNode; onClick?: () => void; href?: string; type?: "button" | "submit" }) {
  const cls = "rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50";
  if (href) {
    return (
      <a href={href} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button type={type} onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

/** Sticky-header table shell with horizontal scroll for wide grids. */
export function PlannerTable({ columns, children, minWidth = 720 }: { columns: ReactNode[]; children: ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((column, index) => (
              <th key={index} className="whitespace-nowrap px-3 py-2.5 font-semibold">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

/** Section card used for grouped blocks inside a page. */
export function PlannerSection({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="lexora-card border-slate-200 bg-white p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** Dashed empty state, never a fake row. */
export function PlannerEmpty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
      <p className="font-semibold text-slate-800">{title}</p>
      <p className="mt-1">{body}</p>
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </div>
  );
}

/** Month grid used by the deadline/activity calendars. */
export function PlannerMonthGrid({
  month,
  daysInMonth,
  leadingBlanks,
  today,
  render,
}: {
  month: string;
  daysInMonth: number;
  leadingBlanks: number;
  today?: string;
  render: (iso: string, day: number) => ReactNode;
}) {
  return (
    <div className="grid grid-cols-7 gap-1 text-xs">
      {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((label) => (
        <span key={label} className="text-center font-semibold text-slate-500">
          {label}
        </span>
      ))}
      {Array.from({ length: leadingBlanks }, (_, index) => (
        <span key={`pad-${index}`} />
      ))}
      {Array.from({ length: daysInMonth }, (_, index) => {
        const day = index + 1;
        const iso = `${month}-${String(day).padStart(2, "0")}`;
        return (
          <div key={iso} className={`min-h-[52px] rounded-lg border p-1 ${iso === today ? "border-[#1E3989] bg-[#e9eeff]" : "border-slate-100"}`}>
            <span className={`text-[10px] ${iso === today ? "font-bold text-[#1E3989]" : "text-slate-500"}`}>{day}</span>
            {render(iso, day)}
          </div>
        );
      })}
    </div>
  );
}

/** Formats a Sheets time fraction (0.3125) as HH:MM. */
export function formatClock(fraction: number | null | undefined): string {
  if (fraction == null || !Number.isFinite(fraction)) return "";
  const total = Math.round((((fraction % 1) + 1) % 1) * 24 * 60);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** dd/mm from an ISO date. */
export function formatDayMonth(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso ?? "";
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}
