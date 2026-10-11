import { getSession } from "@/lib/auth";
import { loadPlannerConnectionForUser, listPlannerTodos } from "@/lib/studyPlanner/queries";
import PlannerTodoList from "@/components/planner/PlannerTodoList";

export const dynamic = "force-dynamic";

/**
 * Route 12 — Việc cần làm. Filter chips for all/active/completed/overdue plus
 * the same responsive card feel as tasks; every mutation re-reads its own API.
 */
export default async function PlannerTodosPage() {
  const session = await getSession();
  const connection = session ? await loadPlannerConnectionForUser(session.userId) : null;
  if (!connection) {
    return <section className="space-y-4"><h1 className="text-2xl font-bold">Việc cần làm</h1><p className="text-sm text-muted">Hãy kết nối Study Planner để xem việc cần làm.</p></section>;
  }
  const todos = await listPlannerTodos(connection.id);
  return (
    <section className="space-y-4">
      <header><h1 className="text-2xl font-bold">Việc cần làm</h1><p className="text-sm text-muted">{todos.length} việc</p></header>
      <PlannerTodoList initial={todos} />
    </section>
  );
}
