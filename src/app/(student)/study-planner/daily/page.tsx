import { getSession } from "@/lib/auth";
import { loadPlannerConnectionForUser, listPlannerTasks } from "@/lib/studyPlanner/queries";
import { todayLocal } from "@/lib/studyPlanner/values";
import PlannerTaskList from "@/components/planner/PlannerTaskList";

export const dynamic = "force-dynamic";

/**
 * Route 2 — Kế hoạch ngày & IELTS.
 *
 * The workbook derives the daily view from Nhật ký nhiệm vụ, so the web shows
 * the same joined data rather than a duplicated copy: tasks filtered to the
 * selected calendar date, plus IELTS-skill rows wherever they are set.
 */
export default async function PlannerDailyPage({ searchParams }: { searchParams: { date?: string } }) {
  const session = await getSession();
  const connection = session ? await loadPlannerConnectionForUser(session.userId) : null;
  if (!connection) {
    return <section className="space-y-4"><h1 className="text-2xl font-bold">Kế hoạch ngày & IELTS</h1><p className="text-sm text-muted">Hãy kết nối Study Planner để xem kế hoạch ngày.</p></section>;
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date ?? "") ? searchParams.date! : todayLocal();
  const tasks = await listPlannerTasks(connection.id, { from: date, to: date });
  const ielts = tasks.filter((task) => task.ieltsSkill);
  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Kế hoạch ngày & IELTS</h1>
        <p className="text-sm text-muted">Ngày {date} · {tasks.length} nhiệm vụ{tasks.length ? `, ${tasks.filter((task) => task.completed).length} hoàn thành` : ""}{ielts.length ? ` · ${ielts.length} buổi luyện IELTS` : ""}</p>
      </header>
      <form className="flex items-center gap-2" method="get">
        <input aria-label="Chọn ngày" type="date" name="date" defaultValue={date} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
        <button className="rounded-xl bg-slate-100 px-3 py-2 text-sm hover:bg-slate-200" type="submit">Xem</button>
      </form>
      {ielts.length ? (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-600">Luyện IELTS ({ielts.length})</h2>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {ielts.map((task) => (
              <li key={task.id} className="px-4 py-3 text-sm">
                <p className="font-medium">{task.taskTitle}</p>
                <p className="text-xs text-slate-500">{task.ieltsSkill}{task.ieltsMaterial ? ` · ${task.ieltsMaterial}` : ""}{task.ieltsTaskType ? ` · ${task.ieltsTaskType}` : ""}{task.ieltsBand != null ? ` · band ${task.ieltsBand}` : ""}</p>
                {task.ieltsMistakeAnalysis ? <p className="mt-1 text-xs text-slate-600">Rút kinh nghiệm: {task.ieltsMistakeAnalysis}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <PlannerTaskList initial={tasks} />
    </section>
  );
}
