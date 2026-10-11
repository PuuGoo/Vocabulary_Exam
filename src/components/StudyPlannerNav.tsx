"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Phase 7.2 — grouped navigation matching the workbook's own concepts:
 * Tổng quan / Kế hoạch / Lịch / Trường học / Cá nhân.
 */
const PLANNER_GROUPS: Array<{ label: string; items: Array<{ href: string; label: string }> }> = [
  { label: "Tổng quan", items: [{ href: "/study-planner", label: "Dashboard" }] },
  {
    label: "Kế hoạch",
    items: [
      { href: "/study-planner/daily", label: "Kế hoạch ngày & IELTS" },
      { href: "/study-planner/tasks", label: "Nhật ký nhiệm vụ" },
      { href: "/study-planner/curriculum", label: "Quản lý giáo trình" },
    ],
  },
  {
    label: "Lịch",
    items: [
      { href: "/study-planner/schedule", label: "Lịch học" },
      { href: "/study-planner/week", label: "Lịch tuần" },
      { href: "/study-planner/assignments", label: "Bài tập & deadline" },
    ],
  },
  {
    label: "Trường học",
    items: [
      { href: "/study-planner/classes", label: "Thông tin lớp học" },
      { href: "/study-planner/reading", label: "Danh sách tài liệu đọc" },
      { href: "/study-planner/attendance", label: "Bảng theo dõi chuyên cần" },
    ],
  },
  {
    label: "Cá nhân",
    items: [
      { href: "/study-planner/habits", label: "Habit Tracker" },
      { href: "/study-planner/todos", label: "Danh sách việc cần làm" },
      { href: "/study-planner/activities", label: "Hoạt động" },
    ],
  },
];

export default function StudyPlannerNav({ connected }: { connected: boolean }) {
  const pathname = usePathname();
  const active = (href: string) => pathname === href || (href !== "/study-planner" && pathname?.startsWith(href));
  return (
    <nav className="space-y-2 py-2" aria-label="Study Planner">
      {/* Mobile: horizontal chips keep every section one tap away without overflow. */}
      <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
        {PLANNER_GROUPS.flatMap((group) => group.items).map((tab) => (
          <Link
            key={tab.href}
            href={connected ? tab.href : "/study-planner"}
            aria-current={active(tab.href) ? "page" : undefined}
            className={
              active(tab.href)
                ? "shrink-0 rounded-full bg-gold px-3 py-1.5 text-xs font-semibold text-white"
                : "shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-700"
            }
          >
            {tab.label}
          </Link>
        ))}
      </div>
      {/* Desktop: grouped sidebar matching the workbook structure. */}
      <div className="hidden gap-6 lg:flex lg:flex-wrap">
        {PLANNER_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{group.label}</p>
            <ul className="space-y-1">
              {group.items.map((tab) => (
                <li key={tab.href}>
                  <Link
                    href={connected ? tab.href : "/study-planner"}
                    aria-current={active(tab.href) ? "page" : undefined}
                    className={
                      active(tab.href)
                        ? "block rounded-xl bg-gold px-3 py-1.5 text-sm font-semibold text-white"
                        : "block rounded-xl px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
                    }
                  >
                    {tab.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
