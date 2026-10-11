import { getSession } from "@/lib/auth";
import { loadPlannerConnectionForUser, listPlannerReading } from "@/lib/studyPlanner/queries";

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
    return <section className="space-y-4"><h1 className="text-2xl font-bold">Tài liệu đọc</h1><p className="text-sm text-muted">Hãy kết nối Study Planner để xem tài liệu đọc.</p></section>;
  }
  const materials = await listPlannerReading(connection.id);
  return (
    <section className="space-y-4">
      <header><h1 className="text-2xl font-bold">Tài liệu đọc</h1><p className="text-sm text-muted">{materials.length} tài liệu</p></header>
      {materials.length ? (
        <ul className="space-y-3">
          {materials.map((item) => {
            const progress = item.totalPages && item.totalPages > 0 ? Math.min(100, Math.round(((item.currentPage ?? 0) / item.totalPages) * 100)) : null;
            return (
              <li key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="font-medium">{item.title}</p>
                <p className="text-sm text-slate-600">{item.subject}{item.author ? ` · ${item.author}` : ""}{item.notes ? ` · ${item.notes}` : ""}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span>{item.currentPage ?? 0}/{item.totalPages ?? "—"} trang</span>
                  {progress != null ? (
                    <span className="flex items-center gap-2"><span className="h-2 w-24 overflow-hidden rounded-full bg-slate-100"><span className="block h-2 rounded-full bg-indigo-500" style={{ width: `${progress}%` }} /></span>{progress}%</span>
                  ) : null}
                  {item.targetPages != null ? <span>mục tiêu {item.targetPages} trang</span> : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">Chưa có tài liệu đọc nào.</p>
      )}
    </section>
  );
}
