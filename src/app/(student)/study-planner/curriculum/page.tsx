import { getSession } from "@/lib/auth";
import { loadPlannerConnectionForUser, listPlannerCurriculum } from "@/lib/studyPlanner/queries";

export const dynamic = "force-dynamic";

/**
 * Route 7 — Quản lý giáo trình.
 *
 * Subjects, chapters/topics, expected weeks, progress and status, all from
 * real rows. Subject and status filters, progress indicator and empty state.
 */
export default async function PlannerCurriculumPage({ searchParams }: { searchParams: { subject?: string; status?: string } }) {
  const session = await getSession();
  const connection = session ? await loadPlannerConnectionForUser(session.userId) : null;
  if (!connection) {
    return <section className="space-y-4"><h1 className="text-2xl font-bold">Giáo trình</h1><p className="text-sm text-muted">Hãy kết nối Study Planner để xem giáo trình.</p></section>;
  }
  const topics = await listPlannerCurriculum(connection.id);
  const subjects = [...new Set(topics.map((topic) => topic.subject))].sort((left, right) => left.localeCompare(right));
  const chosenSubject = searchParams.subject ?? "";
  const chosenStatus = searchParams.status ?? "";
  const filtered = topics.filter((topic) => {
    if (chosenSubject && topic.subject !== chosenSubject) return false;
    if (chosenStatus === "done" && !topic.completed) return false;
    if (chosenStatus === "todo" && topic.completed) return false;
    if (chosenStatus && !["done", "todo"].includes(chosenStatus) && (topic.statusText ?? "") !== chosenStatus) return false;
    return true;
  });
  const completed = filtered.filter((topic) => topic.completed).length;
  const progress = filtered.length ? Math.round((completed / filtered.length) * 100) : 0;
  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Quản lý giáo trình</h1>
        <p className="text-sm text-muted">{filtered.length}/{topics.length} chủ đề · {completed} hoàn thành ({progress}%)</p>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-2 rounded-full bg-emerald-500" style={{ width: `${progress}%` }} /></div>
      </header>
      <form method="get" className="flex flex-wrap gap-2">
        <select aria-label="Lọc theo môn học" name="subject" defaultValue={chosenSubject} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="">Mọi môn</option>
          {subjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
        </select>
        <select aria-label="Lọc theo trạng thái" name="status" defaultValue={chosenStatus} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="">Mọi trạng thái</option>
          <option value="done">Đã hoàn thành</option>
          <option value="todo">Chưa xong</option>
        </select>
        <button type="submit" className="rounded-xl bg-slate-100 px-3 py-2 text-sm">Lọc</button>
      </form>
      {filtered.length ? (
        <ul className="space-y-2">
          {filtered.map((topic) => (
            <li key={topic.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <span aria-hidden className={`flex h-7 w-7 items-center justify-center rounded-full border text-sm ${topic.completed ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white"}`}>✓</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{topic.subject} · {topic.topic}</p>
                <p className="text-xs text-slate-500">
                  {topic.expectedWeek != null ? `Tuần ${topic.expectedWeek}` : "Chưa hẹn tuần"}
                  {topic.statusText ? ` · ${topic.statusText}` : ""}
                  {topic.notes ? ` · ${topic.notes}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">Chưa có chủ đề nào cho bộ lọc hiện tại.</p>
      )}
    </section>
  );
}
