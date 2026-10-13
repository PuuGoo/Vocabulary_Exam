import { getSession } from "@/lib/auth";
import { loadPlannerConnectionForUser, listPlannerAttendance } from "@/lib/studyPlanner/queries";
import {
  PlannerEmpty,
  PlannerKpiStrip,
  PlannerPageHeader,
  PlannerPill,
  PlannerTable,
  type PlannerTone,
} from "@/components/planner/PlannerShell";

export const dynamic = "force-dynamic";

const MARK_TONE: Record<string, PlannerTone> = { "\u2714": "ok", "\u23f3": "or", "\u2718": "late" };
const MARK_LABEL: Record<string, string> = { "\u2714": "C\u00f3 m\u1eb7t", "\u23f3": "\u0110i mu\u1ed9n", "\u2718": "V\u1eafng" };

/**
 * Route 10 - B\u1ea3ng theo d\u00f5i chuy\u00ean c\u1ea7n.
 *
 * Attendance is keyed by (session date, course) rather than the sheet column,
 * so inserting a new session does not rewrite history. The view shares the
 * same summary total used by the Dashboard.
 */
export default async function PlannerAttendancePage() {
  const session = await getSession();
  const connection = session ? await loadPlannerConnectionForUser(session.userId) : null;
  if (!connection) {
    return (
      <section className="space-y-4">
        <PlannerPageHeader title="B\u1ea2NG THEO D\u00d5I CHUY\u00caN C\u1ea6N" subtitle="K\u1ebft n\u1ed1i Study Planner \u0111\u1ec3 xem chuy\u00ean c\u1ea7n." />
        <PlannerEmpty title="Ch\u01b0a k\u1ebft n\u1ed1i Study Planner." body="H\u00e3y k\u1ebft n\u1ed1i Google Sheet \u1edf T\u1ed5ng quan tr\u01b0\u1edbc khi xem chuy\u00ean c\u1ea7n." />
      </section>
    );
  }

  const { sessions, marks } = await listPlannerAttendance(connection.id);
  const sessionDate = new Map(sessions.map((item) => [item.id, item.sessionDate]));

  const totals = {
    present: marks.filter((mark) => mark.mark === "\u2714").length,
    late: marks.filter((mark) => mark.mark === "\u23f3").length,
    absent: marks.filter((mark) => mark.mark === "\u2718").length,
  };
  const denominator = marks.length || 1;
  const rate = Math.round(((totals.present + totals.late) / denominator) * 100);

  // One row per course, exactly like the workbook's attendance grid.
  const byCourse = new Map<string, { present: number; late: number; absent: number; entries: { date: string; mark: string }[] }>();
  for (const mark of marks) {
    const key = mark.courseName || "M\u00f4n h\u1ecdc";
    const row = byCourse.get(key) ?? { present: 0, late: 0, absent: 0, entries: [] };
    if (mark.mark === "\u2714") row.present += 1;
    else if (mark.mark === "\u23f3") row.late += 1;
    else if (mark.mark === "\u2718") row.absent += 1;
    row.entries.push({ date: sessionDate.get(mark.sessionId) ?? "", mark: mark.mark });
    byCourse.set(key, row);
  }
  const courseRows = [...byCourse.entries()].sort((left, right) => left[0].localeCompare(right[0], "vi"));
  for (const [, row] of courseRows) row.entries.sort((left, right) => left.date.localeCompare(right.date));

  return (
    <section className="space-y-4">
      <PlannerPageHeader
        title="B\u1ea2NG THEO D\u00d5I CHUY\u00caN C\u1ea6N"
        subtitle={`${marks.length} l\u1ea7n \u0111i\u1ec3m danh \u00b7 ${sessions.length} bu\u1ed5i \u00b7 t\u1ef7 l\u1ec7 ${rate}%`}
      />

      <PlannerKpiStrip
        items={[
          { label: "C\u00f3 m\u1eb7t \u2714", value: totals.present },
          { label: "\u0110i mu\u1ed9n \u23f3", value: totals.late },
          { label: "V\u1eafng \u2718", value: totals.absent },
          { label: "T\u1ef7 l\u1ec7 chuy\u00ean c\u1ea7n", value: `${rate}%`, progress: rate, tone: rate < 80 ? "late" : "ok" },
        ]}
      />

      {rate < 80 && marks.length ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          C\u1ea3nh b\u00e1o c\u1ea5m thi - t\u1ef7 l\u1ec7 chuy\u00ean c\u1ea7n d\u01b0\u1edbi 80%. H\u00e3y ki\u1ec3m tra c\u00e1c bu\u1ed5i v\u1eafng.
        </p>
      ) : null}

      {courseRows.length ? (
        <PlannerTable columns={["M\u00f4n h\u1ecdc", "C\u00f3 m\u1eb7t \u2714", "\u0110i mu\u1ed9n \u23f3", "V\u1eafng \u2718", "T\u1ef7 l\u1ec7", "Chi ti\u1ebft bu\u1ed5i"]} minWidth={900}>
          {courseRows.map(([course, row]) => {
            const total = row.present + row.late + row.absent || 1;
            const rowRate = Math.round(((row.present + row.late) / total) * 100);
            return (
              <tr key={course} className="align-top hover:bg-slate-50">
                <td className="px-3 py-2.5 font-semibold text-slate-900">{course}</td>
                <td className="px-3 py-2.5 text-emerald-700">{row.present}</td>
                <td className="px-3 py-2.5 text-amber-700">{row.late}</td>
                <td className="px-3 py-2.5 text-red-700">{row.absent}</td>
                <td className="px-3 py-2.5">
                  <PlannerPill tone={rowRate < 80 ? "late" : "ok"}>{rowRate}%</PlannerPill>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    {row.entries.map((entry, index) => (
                      <PlannerPill key={`${course}-${index}`} tone={MARK_TONE[entry.mark] ?? "mute"}>
                        {entry.date ? `${entry.date.slice(8, 10)}/${entry.date.slice(5, 7)} \u00b7 ` : ""}
                        {MARK_LABEL[entry.mark] ?? entry.mark}
                      </PlannerPill>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </PlannerTable>
      ) : (
        <PlannerEmpty title="Ch\u01b0a c\u00f3 bu\u1ed5i \u0111i\u1ec3m danh n\u00e0o." body="Sheet s\u1ebd \u0111\u1ed3ng b\u1ed9 khi b\u1ea1n \u0111i\u1ec3m danh trong tab B\u1ea3ng theo d\u00f5i chuy\u00ean c\u1ea7n." />
      )}

      {sessions.length && !marks.length ? (
        <PlannerTable columns={["Bu\u1ed5i", "Ng\u00e0y"]} minWidth={420}>
          {sessions.map((item) => (
            <tr key={item.id} className="hover:bg-slate-50">
              <td className="px-3 py-2.5 text-slate-600">Bu\u1ed5i {item.sessionIndex}</td>
              <td className="px-3 py-2.5 font-medium text-slate-900">{item.sessionDate}</td>
            </tr>
          ))}
        </PlannerTable>
      ) : null}
    </section>
  );
}
