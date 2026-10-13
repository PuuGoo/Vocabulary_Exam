import { getSession } from "@/lib/auth";
import { loadPlannerConnectionForUser, listPlannerReading } from "@/lib/studyPlanner/queries";
import {
  PlannerBar,
  PlannerEmpty,
  PlannerKpiStrip,
  PlannerPageHeader,
  PlannerTable,
} from "@/components/planner/PlannerShell";

export const dynamic = "force-dynamic";

/**
 * Route 9 — Danh sách tài liệu đọc.
 *
 * Progress is calculated from current_page / total_pages, never stored as a
 * second editable value: the bar stays honest even when the Sheet computes it
 * with a formula.
 */
export default async function PlannerReadingPage() {
  const session = await getSession();
  const connection = session ? await loadPlannerConnectionForUser(session.userId) : null;
  if (!connection) {
    return (
      <section className="space-y-4">
        <PlannerPageHeader title="DANH SÁCH TÀI LIỆU ĐỌC" subtitle="Kết nối Study Planner để xem tài liệu đọc." />
        <PlannerEmpty title="Chưa kết nối Study Planner." body="Hãy kết nối Google Sheet ở Tổng quan trước khi xem tài liệu." />
      </section>
    );
  }

  const materials = await listPlannerReading(connection.id);
  const readPages = materials.reduce((sum, item) => sum + (item.currentPage ?? 0), 0);
  const totalPages = materials.reduce((sum, item) => sum + (item.totalPages ?? 0), 0);
  const overall = totalPages ? Math.round((readPages / totalPages) * 100) : 0;

  return (
    <section className="space-y-4">
      <PlannerPageHeader
        title="DANH SÁCH TÀI LIỆU ĐỌC"
        subtitle={`${materials.length} tài liệu · ${readPages}/${totalPages} trang đã đọc`}
      />

      <PlannerKpiStrip
        items={[
          { label: "Tổng tài liệu", value: materials.length },
          { label: "Trang đã đọc", value: readPages },
          { label: "Tổng số trang", value: totalPages },
          { label: "Tỷ lệ hoàn thành", value: `${overall}%`, progress: overall },
        ]}
      />

      {materials.length ? (
        <PlannerTable columns={["Môn học", "Tên tài liệu", "Tác giả", "Trang cần đọc", "Hiện tại / Tổng", "Tiến độ", "Ghi chú"]} minWidth={880}>
          {materials.map((item) => {
            const progress = item.totalPages && item.totalPages > 0 ? Math.min(100, Math.round(((item.currentPage ?? 0) / item.totalPages) * 100)) : 0;
            return (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="px-3 py-2.5 text-slate-600">{item.subject || "—"}</td>
                <td className="px-3 py-2.5 font-medium text-slate-900">{item.title}</td>
                <td className="px-3 py-2.5 text-slate-600">{item.author || "—"}</td>
                <td className="px-3 py-2.5 text-slate-600">{item.targetPages != null ? `${item.targetPages} trang` : "—"}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                  {item.currentPage ?? 0} / {item.totalPages ?? "—"}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-24">
                      <PlannerBar value={progress} tone={progress >= 100 ? "ok" : "navy"} />
                    </div>
                    <span className="text-xs font-medium text-slate-600">{progress}%</span>
                  </div>
                </td>
                <td className="max-w-[240px] px-3 py-2.5 text-slate-500">{item.notes || ""}</td>
              </tr>
            );
          })}
        </PlannerTable>
      ) : (
        <PlannerEmpty title="Chưa có tài liệu đọc nào." body="Nhập trong Sheet “Danh sách tài liệu đọc”, web sẽ tự cập nhật." />
      )}
    </section>
  );
}
