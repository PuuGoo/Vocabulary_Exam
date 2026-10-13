import { getSession } from "@/lib/auth";
import { loadPlannerConnectionForUser, listPlannerTasks } from "@/lib/studyPlanner/queries";
import PlannerTaskList from "@/components/planner/PlannerTaskList";

export const dynamic = "force-dynamic";

/**
 * Route 3 — Nhật ký nhiệm vụ.
 * Premium sheet-faithful shell: navy header, 4-card KPI ribbon (server-rendered),
 * then the client list owns search/filter/sort/edit without mock data.
 */
export default async function PlannerTasksPage({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  const session = await getSession();
  const connection = session ? await loadPlannerConnectionForUser(session.userId) : null;
  if (!connection) {
    return (
      <section className="space-y-4">
        <div className="overflow-hidden rounded-2xl bg-[#1A3A6E] px-6 py-6 text-white shadow-sm">
          <h1 className="text-xl font-extrabold tracking-wide">NHẬT KÝ NHIỆM VỤ</h1>
          <p className="mt-1 text-sm text-white/80">Kết nối Study Planner để đồng bộ nhiệm vụ từ Google Sheet.</p>
        </div>
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          <p className="font-semibold">Chưa kết nối Study Planner.</p>
          <p className="mt-1">Hãy kết nối Google Sheet ở Tổng quan trước khi xem nhật ký.</p>
        </div>
      </section>
    );
  }
  const disconnected = !connection.enabled || connection.status === "disconnected";
  const tasks = await listPlannerTasks(connection.id, { from: searchParams.from, to: searchParams.to });
  const total = tasks.length;
  const completed = tasks.filter((t) => t.completed).length;
  const rate = total ? Math.round((completed / total) * 100) : 0;
  const totalMinutes = tasks.reduce((sum, t) => sum + (t.durationMinutes ?? 0), 0);
  const totalHoursLabel = totalMinutes >= 60 ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}p` : `${totalMinutes}p`;

  return (
    <section className="space-y-4">
      <div className="overflow-hidden rounded-2xl bg-[#1A3A6E] px-6 py-5 text-white shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold tracking-wide">NHẬT KÝ NHIỆM VỤ</h1>
            <p className="mt-1 max-w-2xl text-sm text-white/75">
              Nhật ký học tập đồng bộ từ Sheet — theo dõi tiến độ, thời lượng và hạn chót theo thời gian thực.
            </p>
          </div>
          <div className="text-right text-xs text-white/60">
            <p>{total} dòng · cập nhật {new Date().toLocaleDateString("vi-VN")}</p>
            <p className="mt-0.5 max-w-[260px] truncate text-white/50">{connection.spreadsheetName || connection.spreadsheetId}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="lexora-card border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Tổng nhiệm vụ</p>
          <p className="mt-1 text-2xl font-extrabold text-[#1A3A6E]">{total}</p>
          <p className="mt-1 text-xs text-slate-500">Tất cả dòng chưa lưu trữ</p>
        </div>
        <div className="lexora-card border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Đã hoàn thành</p>
          <p className="mt-1 text-2xl font-extrabold text-emerald-700">{completed}</p>
          <p className="mt-1 text-xs text-slate-500">Đã tick Hoàn thành</p>
        </div>
        <div className="lexora-card border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Tỷ lệ</p>
          <p className="mt-1 text-2xl font-extrabold text-[#1A3A6E]">{rate}%</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${rate}%` }} />
          </div>
        </div>
        <div className="lexora-card border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Tổng thời gian</p>
          <p className="mt-1 text-2xl font-extrabold text-[#1A3A6E]">{totalHoursLabel}</p>
          <p className="mt-1 text-xs text-slate-500">{totalMinutes} phút</p>
        </div>
      </div>

      {disconnected ? (
        <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Kết nối Study Planner đang bị ngắt — dữ liệu đang xem là bản đọc từ lần đồng bộ trước.</p>
          <p className="mt-1 text-xs text-amber-800">Thêm / sửa / đồng bộ sẽ bị từ chối cho đến khi kết nối lại. Hãy kết nối lại ở Tổng quan hoặc liên hệ quản trị viên nếu Sheet đã bị xoá/thu hồi quyền.</p>
        </div>
      ) : null}

      <PlannerTaskList initial={tasks} disabled={disconnected} />
    </section>
  );
}
