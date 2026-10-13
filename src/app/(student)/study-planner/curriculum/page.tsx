import { getSession } from "@/lib/auth";
import { loadPlannerConnectionForUser, listPlannerCurriculum } from "@/lib/studyPlanner/queries";
import {
  PlannerBar,
  PlannerEmpty,
  PlannerKpiStrip,
  PlannerPageHeader,
  PlannerPill,
  PlannerSection,
  PlannerTable,
} from "@/components/planner/PlannerShell";

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
    return (
      <section className="space-y-4">
        <PlannerPageHeader title="QUẢN LÝ GIÁO TRÌNH" subtitle="Kết nối Study Planner để xem giáo trình." />
        <PlannerEmpty title="Chưa kết nối Study Planner." body="Hãy kết nối Google Sheet ở Tổng quan trước khi xem giáo trình." />
      </section>
    );
  }

  const topics = await listPlannerCurriculum(connection.id);
  const subjects = [...new Set(topics.map((topic) => topic.subject))].sort((left, right) => left.localeCompare(right, "vi"));
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

  // Per-subject rollup, like the workbook's "Tiến độ theo từng môn học" block.
  const perSubject = subjects.map((subject) => {
    const rows = topics.filter((topic) => topic.subject === subject);
    const done = rows.filter((topic) => topic.completed).length;
    return { subject, total: rows.length, done, progress: rows.length ? Math.round((done / rows.length) * 100) : 0 };
  });

  const buildHref = (next: { subject?: string; status?: string }) => {
    const params = new URLSearchParams();
    const subject = next.subject ?? chosenSubject;
    const status = next.status ?? chosenStatus;
    if (subject) params.set("subject", subject);
    if (status) params.set("status", status);
    const query = params.toString();
    return `/study-planner/curriculum${query ? `?${query}` : ""}`;
  };

  return (
    <section className="space-y-4">
      <PlannerPageHeader
        title="QUẢN LÝ GIÁO TRÌNH"
        subtitle={`${filtered.length}/${topics.length} chủ đề · ${completed} hoàn thành · ${subjects.length} môn`}
      />

      <PlannerKpiStrip
        items={[
          { label: "Tổng chủ đề", value: topics.length },
          { label: "Đã hoàn thành", value: topics.filter((topic) => topic.completed).length },
          { label: "Còn lại", value: topics.filter((topic) => !topic.completed).length },
          { label: "Tỷ lệ hoàn thành", value: `${progress}%`, progress },
          { label: "Số môn", value: subjects.length },
        ]}
      />

      <PlannerSection title="Bộ lọc">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {[
              { key: "", label: "Tất cả", count: topics.length },
              { key: "todo", label: "Chưa xong", count: topics.filter((topic) => !topic.completed).length },
              { key: "done", label: "Đã hoàn thành", count: topics.filter((topic) => topic.completed).length },
            ].map((chip) => {
              const active = chosenStatus === chip.key;
              return (
                <a
                  key={chip.key || "all"}
                  href={buildHref({ status: chip.key })}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                    active ? "border-[#1E3989] bg-[#1E3989] text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {chip.label}
                  <span className="ml-1.5 text-xs opacity-80">{chip.count}</span>
                </a>
              );
            })}
          </div>
          <form method="get" className="flex flex-wrap items-center gap-2">
            <select aria-label="Lọc theo môn học" name="subject" defaultValue={chosenSubject} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="">Mọi môn</option>
              {subjects.map((subject) => (
                <option key={subject} value={subject}>{subject}</option>
              ))}
            </select>
            <select aria-label="Lọc theo trạng thái" name="status" defaultValue={chosenStatus} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="">Mọi trạng thái</option>
              <option value="done">Đã hoàn thành</option>
              <option value="todo">Chưa xong</option>
            </select>
            <button type="submit" className="rounded-xl bg-[#1E3989] px-4 py-2 text-sm font-semibold text-white">Lọc</button>
            {chosenSubject || chosenStatus ? (
              <a href="/study-planner/curriculum" className="rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-700">Xoá lọc</a>
            ) : null}
          </form>
        </div>
      </PlannerSection>

      {filtered.length ? (
        <>
          <PlannerSection title="Danh sách chủ đề">
            <PlannerTable columns={["Hoàn thành", "Môn học", "Chương / Chủ đề", "Tuần dự kiến", "Trạng thái", "Ghi chú"]} minWidth={900}>
              {filtered.map((topic) => (
                <tr key={topic.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5">
                    <span
                      aria-hidden
                      className={`grid h-6 w-6 place-items-center rounded-full border-2 text-xs ${
                        topic.completed ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-semibold text-slate-900">{topic.subject}</td>
                  <td className="px-3 py-2.5 font-medium text-slate-800">{topic.topic}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{topic.expectedWeek != null ? `Tuần ${topic.expectedWeek}` : "—"}</td>
                  <td className="px-3 py-2.5">
                    <PlannerPill tone={topic.completed ? "ok" : (topic.statusText ?? "").toLowerCase().includes("đang") ? "prog" : "mute"}>
                      {topic.completed ? "Đã học" : topic.statusText || "Chưa học"}
                    </PlannerPill>
                  </td>
                  <td className="max-w-[260px] px-3 py-2.5 text-slate-500">{topic.notes || ""}</td>
                </tr>
              ))}
            </PlannerTable>
          </PlannerSection>

          <PlannerSection title="Tiến độ theo từng môn học">
            <div className="space-y-3">
              {perSubject.map((row) => (
                <div key={row.subject} className="flex flex-wrap items-center gap-3">
                  <span className="w-[220px] flex-none truncate text-sm font-medium text-slate-700">{row.subject}</span>
                  <div className="min-w-[120px] flex-1">
                    <PlannerBar value={row.progress} tone={row.progress >= 100 ? "ok" : "navy"} />
                  </div>
                  <span className="w-[130px] flex-none text-right text-xs text-slate-500">
                    {row.done}/{row.total} chủ đề · {row.progress}%
                  </span>
                </div>
              ))}
            </div>
          </PlannerSection>
        </>
      ) : (
        <PlannerEmpty title="Chưa có chủ đề nào cho bộ lọc hiện tại." body="Thử đổi bộ lọc, hoặc nhập chủ đề trong Sheet “Quản lý giáo trình”." />
      )}
    </section>
  );
}
