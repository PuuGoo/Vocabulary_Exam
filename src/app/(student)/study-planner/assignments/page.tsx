import { getSession } from "@/lib/auth";
import { loadPlannerConnectionForUser, listPlannerAssignments } from "@/lib/studyPlanner/queries";
import { todayLocal } from "@/lib/studyPlanner/values";
import {
  PlannerBar,
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

function dueState(dueDate: string | null, today: string): "overdue" | "soon" | "normal" | "none" {
  if (!dueDate) return "none";
  if (dueDate < today) return "overdue";
  const diff = (new Date(`${dueDate}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000;
  return diff <= 3 ? "soon" : "normal";
}

function daysLeft(dueDate: string | null, today: string): number | null {
  if (!dueDate) return null;
  return Math.round((new Date(`${dueDate}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000);
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
    return (
      <section className="space-y-4">
        <PlannerPageHeader title="BẢNG THEO DÕI BÀI TẬP" subtitle="Kết nối Study Planner để xem bài tập." />
        <PlannerEmpty title="Chưa kết nối Study Planner." body="Hãy kết nối Google Sheet ở Tổng quan trước khi xem bài tập." />
      </section>
    );
  }

  const assignments = await listPlannerAssignments(connection.id);
  const today = todayLocal();
  const month = /^\d{4}-\d{2}$/.test(searchParams.month ?? "") ? searchParams.month! : today.slice(0, 7);
  const monthStart = new Date(`${month}-01T00:00:00Z`);
  const daysInMonth = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)).getUTCDate();
  const leadingBlanks = (monthStart.getUTCDay() + 6) % 7;

  const byDay = new Map<string, typeof assignments>();
  for (const item of assignments) {
    if (!item.dueDate || !item.dueDate.startsWith(month)) continue;
    byDay.set(item.dueDate, [...(byDay.get(item.dueDate) ?? []), item]);
  }

  const counts = { overdue: 0, soon: 0, done: 0 };
  for (const item of assignments) {
    const state = dueState(item.dueDate, today);
    if (state === "overdue") counts.overdue += 1;
    if (state === "soon") counts.soon += 1;
    if (item.grade) counts.done += 1;
  }
  const progress = assignments.length ? Math.round((counts.done / assignments.length) * 100) : 0;

  return (
    <section className="space-y-4">
      <PlannerPageHeader
        title="BẢNG THEO DÕI BÀI TẬP"
        subtitle={`${assignments.length} bài tập · ${counts.overdue} quá hạn · ${counts.soon} sắp đến hạn`}
        actions={
          <form method="get" className="flex items-center gap-2">
            <input aria-label="Chọn tháng" type="month" name="month" defaultValue={month} className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-sm text-white" />
            <button type="submit" className="rounded-xl bg-white px-3.5 py-2 text-sm font-semibold text-[#1E3989]">Xem</button>
          </form>
        }
      />

      <PlannerKpiStrip
        items={[
          { label: "Bài tập", value: assignments.length },
          { label: "Đã hoàn thành", value: counts.done },
          { label: "Cần làm", value: assignments.length - counts.done },
          { label: "Tiến độ", value: `${progress}%`, progress },
          { label: "Quá hạn", value: counts.overdue, tone: counts.overdue ? "late" : "ok" },
          { label: "Hạn gấp ≤ 3 ngày", value: counts.soon, tone: counts.soon ? "or" : "ok" },
        ]}
      />

      {counts.overdue ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          Có {counts.overdue} bài tập đã quá hạn. Ưu tiên xử lý trước.
        </p>
      ) : null}

      {assignments.length ? (
        <>
          <PlannerSection title="Danh sách bài tập">
            <PlannerTable columns={["Môn học", "Mô tả", "Phân loại", "Trạng thái", "Giờ", "Hạn nộp", "Còn lại", "Điểm", "Ghi chú"]} minWidth={1180}>
              {assignments.map((item) => {
                const state = dueState(item.dueDate, today);
                const left = daysLeft(item.dueDate, today);
                const done = Boolean(item.grade);
                return (
                  <tr key={item.id} className="align-top hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-semibold text-slate-900">{item.subject || "—"}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-800">{item.description}</td>
                    <td className="px-3 py-2.5 text-slate-600">{item.category || "—"}</td>
                    <td className="px-3 py-2.5">
                      <PlannerPill tone={done ? "ok" : (item.statusText ?? "").toLowerCase().includes("đang") ? "prog" : "mute"}>
                        {item.statusText || (done ? "Hoàn thành" : "Chưa bắt đầu")}
                      </PlannerPill>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{item.durationHours != null ? `${item.durationHours}h` : "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                      {item.dueDate || "—"}
                      {item.dueTime != null ? ` ${formatClock(item.dueTime)}` : ""}
                    </td>
                    <td className="px-3 py-2.5">
                      {done ? (
                        <PlannerPill tone="ok">✔ Xong</PlannerPill>
                      ) : left == null ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <PlannerPill tone={state === "overdue" ? "late" : state === "soon" ? "or" : "prog"}>
                          {left < 0 ? `Quá hạn ${-left} ngày` : left === 0 ? "Hôm nay" : `Còn ${left} ngày`}
                        </PlannerPill>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{item.grade || "—"}</td>
                    <td className="max-w-[220px] px-3 py-2.5 text-slate-500">{item.notes || ""}</td>
                  </tr>
                );
              })}
            </PlannerTable>
          </PlannerSection>

          <PlannerSection title={`Lịch deadline tháng ${month}`}>
            <PlannerMonthGrid
              month={month}
              daysInMonth={daysInMonth}
              leadingBlanks={leadingBlanks}
              today={today}
              render={(iso) => {
                const items = byDay.get(iso) ?? [];
                if (!items.length) return null;
                const state = dueState(iso, today);
                return (
                  <>
                    {items.slice(0, 2).map((item) => (
                      <p key={item.id} className="truncate text-[10px] text-slate-700">{item.description}</p>
                    ))}
                    {items.length > 2 ? <p className="text-[10px] text-slate-500">+{items.length - 2}</p> : null}
                    <span
                      className={`mt-0.5 inline-block h-1.5 w-1.5 rounded-full ${
                        state === "overdue" ? "bg-red-500" : state === "soon" ? "bg-amber-500" : "bg-[#1E3989]"
                      }`}
                      aria-hidden="true"
                    />
                  </>
                );
              }}
            />
          </PlannerSection>

          <PlannerSection title="Tiến độ hoàn thành theo môn">
            <div className="space-y-3">
              {[...new Set(assignments.map((item) => item.subject || "Khác"))].map((subject) => {
                const rows = assignments.filter((item) => (item.subject || "Khác") === subject);
                const done = rows.filter((item) => item.grade).length;
                const share = rows.length ? Math.round((done / rows.length) * 100) : 0;
                return (
                  <div key={subject} className="flex flex-wrap items-center gap-3">
                    <span className="w-[220px] flex-none truncate text-sm text-slate-700">{subject}</span>
                    <div className="min-w-[120px] flex-1">
                      <PlannerBar value={share} tone={share >= 100 ? "ok" : "navy"} />
                    </div>
                    <span className="w-[120px] flex-none text-right text-xs text-slate-500">{done}/{rows.length} bài · {share}%</span>
                  </div>
                );
              })}
            </div>
          </PlannerSection>
        </>
      ) : (
        <PlannerEmpty title="Chưa có bài tập nào." body="Nhập trong Sheet “Bảng theo dõi bài tập”, web sẽ tự cập nhật." />
      )}
    </section>
  );
}
