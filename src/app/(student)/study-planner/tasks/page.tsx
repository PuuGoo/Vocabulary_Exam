import { getSession } from "@/lib/auth";
import { loadPlannerConnectionForUser, listPlannerTasks } from "@/lib/studyPlanner/queries";
import PlannerTaskList from "@/components/planner/PlannerTaskList";

export const dynamic = "force-dynamic";

/**
 * Route 3 — Nhật ký nhiệm vụ.
 *
 * Real rows from PostgreSQL, with date filters, completion toggles, priority
 * filters and duration summaries. A server render keeps the first paint fast;
 * the client list only re-reads its own API route after each mutation.
 */
export default async function PlannerTasksPage({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  const session = await getSession();
  const connection = session ? await loadPlannerConnectionForUser(session.userId) : null;
  if (!connection) {
    return <section className="space-y-4"><h1 className="text-2xl font-bold">Nhật ký nhiệm vụ</h1><p className="text-sm text-muted">Hãy kết nối Study Planner để xem nhiệm vụ của bạn.</p></section>;
  }
  const tasks = await listPlannerTasks(connection.id, { from: searchParams.from, to: searchParams.to });
  const totalMinutes = tasks.reduce((sum, task) => sum + (task.durationMinutes ?? 0), 0);
  const completed = tasks.filter((task) => task.completed).length;
  const completion = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Nhật ký nhiệm vụ</h1>
          <p className="text-sm text-muted">{tasks.length} nhiệm vụ · {completed} hoàn thành ({completion}%) · {totalMinutes} phút</p>
        </div>
      </header>
      <PlannerTaskList initial={tasks} />
    </section>
  );
}
