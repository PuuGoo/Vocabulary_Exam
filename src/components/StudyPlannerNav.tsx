"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PLANNER_TABS: Array<{ href: string; label: string }> = [
  { href: "/study-planner", label: "Tổng quan" },
  { href: "/study-planner/daily", label: "Kế hoạch ngày" },
  { href: "/study-planner/tasks", label: "Nhật ký" },
  { href: "/study-planner/classes", label: "Lớp học" },
  { href: "/study-planner/schedule", label: "Lịch học" },
  { href: "/study-planner/week", label: "Lịch tuần" },
  { href: "/study-planner/curriculum", label: "Giáo trình" },
  { href: "/study-planner/assignments", label: "Bài tập" },
  { href: "/study-planner/reading", label: "Tài liệu đọc" },
  { href: "/study-planner/attendance", label: "Chuyên cần" },
  { href: "/study-planner/habits", label: "Thói quen" },
  { href: "/study-planner/todos", label: "Việc cần làm" },
  { href: "/study-planner/activities", label: "Hoạt động" },
];

export default function StudyPlannerNav({ connected }: { connected: boolean }) {
  const pathname = usePathname();
  const active = (href: string) => pathname === href || (href !== "/study-planner" && pathname?.startsWith(href));
  return (
    <nav className="flex flex-wrap gap-2 py-2" aria-label="Study Planner">
      {PLANNER_TABS.map((tab) => (
        <Link
          key={tab.href}
          href={connected ? tab.href : "/study-planner"}
          className={
            active(tab.href)
              ? "rounded-full bg-gold px-3 py-1 text-sm font-semibold text-white"
              : "rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700 hover:bg-slate-200"
          }
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
