import { getSession } from "@/lib/auth";
import { loadPlannerConnectionForUser, listPlannerTodos } from "@/lib/studyPlanner/queries";
import PlannerTodoList from "@/components/planner/PlannerTodoList";
import { PlannerEmpty, PlannerPageHeader } from "@/components/planner/PlannerShell";

export const dynamic = "force-dynamic";

/**
 * Route 12 — Việc cần làm. Server-rendered header + the client journal that
 * owns search, filters, completion toggles and the create/edit drawer.
 */
export default async function PlannerTodosPage() {
  const session = await getSession();
  const connection = session ? await loadPlannerConnectionForUser(session.userId) : null;
  if (!connection) {
    return (
      <section className="space-y-4">
        <PlannerPageHeader title="DANH SÁCH VIỆC CẦN LÀM" subtitle="Kết nối Study Planner để xem việc cần làm." />
        <PlannerEmpty title="Chưa kết nối Study Planner." body="Hãy kết nối Google Sheet ở Tổng quan trước khi xem việc cần làm." />
      </section>
    );
  }
  const todos = await listPlannerTodos(connection.id);
  const done = todos.filter((todo) => todo.completed).length;
  return (
    <section className="space-y-4">
      <PlannerPageHeader
        title="DANH SÁCH VIỆC CẦN LÀM"
        subtitle={`${todos.length} việc · ${done} đã xong · ${todos.length - done} còn lại`}
      />
      <PlannerTodoList initial={todos} />
    </section>
  );
}
