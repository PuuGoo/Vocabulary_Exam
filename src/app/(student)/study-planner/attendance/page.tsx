import { getSession } from "@/lib/auth";
import { loadPlannerConnectionForUser, listPlannerAttendance } from "@/lib/studyPlanner/queries";

export const dynamic = "force-dynamic";

/**
 * Route 10 — Bảng theo dõi chuyên cần.
 *
 * Attendance is keyed by (session date, course) rather than the sheet column,
 * so inserting a new session does not rewrite history. The view shares the
 * same summary total used by the Dashboard.
 */
export default async function PlannerAttendancePage() {
  const session = await getSession();
  const connection = session ? await loadPlannerConnectionForUser(session.userId) : null;
  if (!connection) {
    return <section className="space-y-4"><h1 className="text-2xl font-bold">Chuyên cần</h1><p className="text-sm text-muted">Hãy kết nối Study Planner để xem chuyên cần.</p></section>;
  }
  const { sessions, marks } = await listPlannerAttendance(connection.id);
  const marksBySession = new Map<number, typeof marks>();
  for (const mark of marks) {
    const current = marksBySession.get(mark.sessionId) ?? [];
    current.push(mark);
    marksBySession.set(mark.sessionId, current);
  }
  const totals = {
    present: marks.filter((mark) => mark.mark === "✔").length,
    late: marks.filter((mark) => mark.mark === "⏳").length,
    absent: marks.filter((mark) => mark.mark === "✘").length,
  };
  const denominator = marks.length || 1;
  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Bảng theo dõi chuyên cần</h1>
        <p className="text-sm text-muted">{marks.length} lần điểm danh · có mặt {totals.present}/{denominator} ({Math.round((totals.present / denominator) * 100)}%) · đi muộn {totals.late} · vắng {totals.absent}</p>
      </header>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-2 bg-emerald-500" style={{ width: `${Math.round((totals.present / denominator) * 100)}%` }} /></div>
      <ul className="space-y-3">
        {(sessions.length ? sessions : []).map((session) => {
          const sessionMarks = marksBySession.get(session.id) ?? [];
          return (
            <li key={session.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-medium">{session.sessionDate}{sessionMarks.length ? <span className="ml-2 text-xs font-normal text-slate-500">{sessionMarks.length} môn trong buổi</span> : null}</p>
              {sessionMarks.length ? (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {sessionMarks.map((mark) => (
                    <li key={mark.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs">{mark.courseName} {mark.mark === "✔" ? "✓ có mặt" : mark.mark === "⏳" ? "⏳ đi muộn" : "✘ vắng"}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-slate-500">Chưa điểm danh buổi này.</p>
              )}
            </li>
          );
        })}
      </ul>
      {!sessions.length ? <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">Chưa có buổi điểm danh nào — Sheet sẽ đồng bộ khi bạn điểm danh.</p> : null}
    </section>
  );
}
