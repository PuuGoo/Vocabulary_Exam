"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import { toast } from "@/components/Toast";
import { cx } from "@/components/ui";
import { ASSIGNMENT_MODE_LABELS, AssignmentMode, AssignmentStatus, assignmentHref, modesForSetType } from "@/lib/assignments";
import { buildCsv } from "@/lib/csv";

type ClassRow = { id: number; name: string; memberCount: number };
type SetRow = { id: number; name: string; type: string; classId: number | null; count: number };
type AssignmentRow = {
  id: number; classId: number; className: string; setId: number; setName: string; setType: string;
  title: string; instructions: string; mode: AssignmentMode; minScore: number; dueAt: string | null;
  timeLimitMinutes: number | null; archived: boolean; createdAt: string;
  summary: { total: number; completed: number; late: number; overdue: number; inProgress: number; excused: number };
};
type StudentProgress = { userId: number; username: string; displayName: string; status: AssignmentStatus; completedAt: string | null; bestAccuracy: number | null; attemptCount: number; extensionDueAt: string | null; excused: boolean; submission: { id: number; textContent: string | null; fileName: string | null; fileType: string | null; fileSize: number | null; submittedAt: string } | null };
type FormState = { classId: string; setId: string; title: string; instructions: string; mode: AssignmentMode; minScore: string; dueAt: string; timeLimitMinutes: string };

const emptyForm: FormState = { classId: "", setId: "", title: "", instructions: "", mode: "fill", minScore: "70", dueAt: "", timeLimitMinutes: "15" };
const statusLabels: Record<AssignmentStatus, string> = { pending: "Chưa làm", in_progress: "Đang làm", overdue: "Quá hạn", completed: "Hoàn thành", completed_late: "Hoàn thành muộn", excused: "Được miễn" };

function dateText(value: string | null) { return value ? new Date(value).toLocaleString("vi-VN", { dateStyle: "medium", timeStyle: "short" }) : "Không giới hạn"; }
function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function AdminAssignmentsPage() {
  const [rows, setRows] = useState<AssignmentRow[] | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [sets, setSets] = useState<SetRow[]>([]);
  const [archived, setArchived] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [progressFilter, setProgressFilter] = useState<"all" | "attention" | "incomplete" | "complete">("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AssignmentRow | null>(null);
  const [duplicating, setDuplicating] = useState<AssignmentRow | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkClassIds, setBulkClassIds] = useState<number[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<{ assignment: AssignmentRow; students: StudentProgress[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [extensionStudent, setExtensionStudent] = useState<StudentProgress | null>(null);
  const [extensionDueAt, setExtensionDueAt] = useState("");
  const [extensionSaving, setExtensionSaving] = useState(false);

  async function load(includeArchived = archived) {
    setRows(null); setLoadError(false);
    try {
      const [assignmentRes, classRes, setRes] = await Promise.all([
        fetch(`/api/admin/assignments${includeArchived ? "?archived=1" : ""}`), fetch("/api/admin/classes"), fetch("/api/sets"),
      ]);
      if (!assignmentRes.ok || !classRes.ok || !setRes.ok) throw new Error("load failed");
      const [assignmentData, classData, setData] = await Promise.all([assignmentRes.json(), classRes.json(), setRes.json()]);
      setRows(assignmentData.assignments || []); setClasses(classData.classes || []); setSets(setData.sets || []);
    } catch { setRows([]); setLoadError(true); }
  }

  useEffect(() => { void load(archived); }, [archived]);
  const selectedSet = sets.find((item) => item.id === Number(form.setId));
  const availableSets = useMemo(
    () => sets.filter((item) => bulkMode ? item.classId === null : !form.classId || item.classId === null || item.classId === Number(form.classId)),
    [sets, form.classId, bulkMode]
  );
  const availableModes = modesForSetType(selectedSet?.type || "ielts_vocab");
  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("vi");
    return (rows || []).filter((row) => {
      if (normalized && !`${row.title} ${row.setName} ${row.className}`.toLocaleLowerCase("vi").includes(normalized)) return false;
      if (classFilter && row.classId !== Number(classFilter)) return false;
      const handled = row.summary.completed + row.summary.excused;
      if (progressFilter === "attention" && row.summary.overdue === 0) return false;
      if (progressFilter === "incomplete" && handled >= row.summary.total) return false;
      if (progressFilter === "complete" && (row.summary.total === 0 || handled < row.summary.total)) return false;
      return true;
    });
  }, [rows, query, classFilter, progressFilter]);

  function openCreate() { setEditing(null); setDuplicating(null); setBulkMode(false); setBulkClassIds([]); setForm(emptyForm); setFormOpen(true); }
  function openEdit(row: AssignmentRow) {
    setEditing(row);
    setDuplicating(null);
    setBulkMode(false);
    setBulkClassIds([]);
    setForm({ classId: String(row.classId), setId: String(row.setId), title: row.title, instructions: row.instructions, mode: row.mode, minScore: String(row.minScore), dueAt: toLocalInput(row.dueAt), timeLimitMinutes: String(row.timeLimitMinutes || 15) });
    setFormOpen(true);
  }
  function openDuplicate(row: AssignmentRow) {
    setEditing(null);
    setDuplicating(row);
    setBulkMode(false);
    setBulkClassIds([]);
    setForm({
      classId: String(row.classId),
      setId: String(row.setId),
      title: row.title,
      instructions: row.instructions,
      mode: row.mode,
      minScore: String(row.minScore),
      dueAt: "",
      timeLimitMinutes: String(row.timeLimitMinutes || 15),
    });
    setFormOpen(true);
  }
  function update<K extends keyof FormState>(key: K, value: FormState[K]) { setForm((current) => ({ ...current, [key]: value })); }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!editing && ((bulkMode ? bulkClassIds.length === 0 : !form.classId) || !form.setId)) return toast("Vui lòng chọn lớp và bộ từ.");
    setSaving(true);
    const payload = editing ? {
      title: form.title, instructions: form.instructions, minScore: Number(form.minScore),
      dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
      ...(editing.mode === "timed" ? { timeLimitMinutes: Number(form.timeLimitMinutes) } : {}),
    } : {
      ...(bulkMode ? { classIds: bulkClassIds } : { classId: Number(form.classId) }), setId: Number(form.setId), title: form.title, instructions: form.instructions,
      mode: form.mode, minScore: Number(form.minScore), dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
      timeLimitMinutes: form.mode === "timed" ? Number(form.timeLimitMinutes) : null,
    };
    try {
      const response = await fetch(editing ? `/api/admin/assignments/${editing.id}` : "/api/admin/assignments", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Không thể lưu bài tập.");
      toast(editing ? "Đã cập nhật bài tập." : bulkMode ? `Đã giao bài cho ${bulkClassIds.length} lớp.` : duplicating ? "Đã nhân bản và giao bài mới." : "Đã giao bài cho lớp."); setFormOpen(false); await load(false); if (archived) setArchived(false);
    } catch (error) { toast(error instanceof Error ? error.message : "Không thể lưu bài tập."); }
    finally { setSaving(false); }
  }

  async function toggleArchive(row: AssignmentRow) {
    const action = row.archived ? "khôi phục" : "lưu trữ";
    if (!confirm(`${action[0].toUpperCase()}${action.slice(1)} bài “${row.title}”?`)) return;
    const response = await fetch(`/api/admin/assignments/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archived: !row.archived }) });
    if (!response.ok) return toast(`Không thể ${action} bài tập.`);
    toast(row.archived ? "Đã khôi phục bài tập." : "Đã lưu trữ; học sinh sẽ không còn thấy bài này."); await load();
  }

  async function openDetail(row: AssignmentRow) {
    setDetailLoading(true); setDetail({ assignment: row, students: [] });
    try {
      const response = await fetch(`/api/admin/assignments/${row.id}`); if (!response.ok) throw new Error();
      const data = await response.json(); setDetail(data);
    } catch { toast("Không thể tải tiến độ lớp."); setDetail(null); }
    finally { setDetailLoading(false); }
  }

  function openExtension(student: StudentProgress) {
    if (!detail?.assignment.dueAt) return toast("Hãy đặt hạn nộp chung cho bài trước.");
    const base = new Date(student.extensionDueAt || detail.assignment.dueAt);
    base.setDate(base.getDate() + 1);
    setExtensionStudent(student);
    setExtensionDueAt(toLocalInput(base.toISOString()));
  }

  async function saveExtension(event: FormEvent) {
    event.preventDefault();
    if (!detail || !extensionStudent || !extensionDueAt) return;
    setExtensionSaving(true);
    try {
      const response = await fetch(`/api/admin/assignments/${detail.assignment.id}/extensions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: extensionStudent.userId, dueAt: new Date(extensionDueAt).toISOString() }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Không thể gia hạn.");
      toast(`Đã gia hạn cho ${extensionStudent.displayName}.`); setExtensionStudent(null); await openDetail(detail.assignment);
    } catch (error) { toast(error instanceof Error ? error.message : "Không thể gia hạn."); }
    finally { setExtensionSaving(false); }
  }

  async function removeExtension(student: StudentProgress) {
    if (!detail || !confirm(`Bỏ hạn riêng của ${student.displayName}?`)) return;
    const response = await fetch(`/api/admin/assignments/${detail.assignment.id}/extensions?userId=${student.userId}`, { method: "DELETE" });
    if (!response.ok) return toast("Không thể bỏ gia hạn.");
    toast("Đã đưa học sinh về hạn nộp chung."); await openDetail(detail.assignment);
  }

  async function toggleExcused(student: StudentProgress) {
    if (!detail) return;
    if (!student.excused && !confirm(`Miễn làm bài này cho ${student.displayName}?`)) return;
    const response = await fetch(`/api/admin/assignments/${detail.assignment.id}/exemptions${student.excused ? `?userId=${student.userId}` : ""}`, {
      method: student.excused ? "DELETE" : "POST",
      ...(student.excused ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: student.userId }) }),
    });
    if (!response.ok) return toast("Không thể cập nhật miễn làm bài.");
    toast(student.excused ? "Đã yêu cầu học sinh làm bài trở lại." : `Đã miễn bài cho ${student.displayName}.`);
    await openDetail(detail.assignment);
    await load();
  }

  function exportProgress() {
    if (!detail?.students.length) return toast("Chưa có học sinh để xuất báo cáo.");
    const assignment = detail.assignment;
    const csv = buildCsv(
      ["Lớp", "Bài tập", "Bộ từ", "Học sinh", "Tài khoản", "Trạng thái", "Bài nộp văn bản", "Tệp đính kèm", "Điểm cao nhất (%)", "Số lượt làm", "Hạn riêng", "Hoàn thành lúc"],
      detail.students.map((student) => [
        assignment.className,
        assignment.title,
        assignment.setName,
        student.displayName,
        student.username,
        statusLabels[student.status],
        student.submission?.textContent || "",
        student.submission?.fileName || "",
        student.bestAccuracy,
        student.attemptCount,
        student.extensionDueAt ? new Date(student.extensionDueAt).toLocaleString("vi-VN") : "",
        student.completedAt ? new Date(student.completedAt).toLocaleString("vi-VN") : "",
      ])
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tien-do-bai-${assignment.id}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast("Đã xuất báo cáo tiến độ CSV.");
  }

  return (
    <div className={cx.panel}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div><h2 className={cx.h2}>Giao bài theo lớp</h2><p className={cx.desc + " !mb-0"}>Chọn bộ từ và chế độ; hệ thống tự ghi nhận khi học sinh đạt điểm yêu cầu.</p></div>
        <button className={`${cx.btn} ${cx.btnGold}`} onClick={openCreate}>+ Giao bài mới</button>
      </div>
      <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-line bg-white px-3 py-2">
        <span className="text-sm">{archived ? "Bài đã lưu trữ" : "Bài đang hoạt động"}</span>
        <button className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} onClick={() => setArchived((value) => !value)}>{archived ? "Xem bài đang hoạt động" : "Xem kho lưu trữ"}</button>
      </div>
      {rows && rows.length > 0 && <div className="mb-4 grid gap-2 rounded-lg border border-line bg-white p-3 sm:grid-cols-[1fr_190px_190px]"><input type="search" className={`${cx.input} !mb-0`} placeholder="Tìm bài, bộ từ hoặc lớp..." value={query} onChange={(event) => setQuery(event.target.value)} /><select className={`${cx.input} !mb-0`} value={classFilter} onChange={(event) => setClassFilter(event.target.value)}><option value="">Tất cả lớp</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select className={`${cx.input} !mb-0`} value={progressFilter} onChange={(event) => setProgressFilter(event.target.value as typeof progressFilter)}><option value="all">Mọi tiến độ</option><option value="attention">Có học sinh quá hạn</option><option value="incomplete">Chưa xử lý xong</option><option value="complete">Đã xử lý xong</option></select><div className="text-[0.72rem] text-muted sm:col-span-3">Hiển thị {filteredRows.length}/{rows.length} bài tập</div></div>}
      {rows === null ? <div className={cx.empty}>Đang tải...</div>
        : loadError ? <div className={cx.empty}>Không thể tải danh sách.<div className="mt-3"><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => void load()}>Thử lại</button></div></div>
        : rows.length === 0 ? <div className={cx.empty}>{archived ? "Chưa có bài tập đã lưu trữ." : "Chưa giao bài nào. Hãy tạo bài đầu tiên cho một lớp."}</div>
        : filteredRows.length === 0 ? <div className={cx.empty}>Không tìm thấy bài tập phù hợp.<div className="mt-3"><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => { setQuery(""); setClassFilter(""); setProgressFilter("all"); }}>Xóa bộ lọc</button></div></div>
        : <div className="grid gap-3 xl:grid-cols-2">{filteredRows.map((row) => <article key={row.id} className="rounded-[10px] border border-line bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div><h3 className="font-serif text-lg font-semibold">{row.title}</h3><p className="mt-1 text-[0.82rem] text-muted">{row.className} · {row.setName}</p></div><span className={cx.badgeGold}>{ASSIGNMENT_MODE_LABELS[row.mode]}</span></div>
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-[#faf8f2] p-3 text-[0.8rem] sm:grid-cols-5">
            <div><b className="block text-base">{row.summary.completed}/{row.summary.total}</b><span className="text-muted">hoàn thành</span></div>
            <div><b className="block text-base">{row.summary.inProgress}</b><span className="text-muted">đang làm</span></div>
            <div><b className="block text-base text-bad">{row.summary.overdue}</b><span className="text-muted">quá hạn</span></div>
            <div><b className="block text-base">{row.summary.late}</b><span className="text-muted">nộp muộn</span></div>
            <div><b className="block text-base">{row.summary.excused}</b><span className="text-muted">được miễn</span></div>
          </div>
          <div className="mt-3 text-[0.8rem] text-muted">Hạn: <span className="text-ink">{dateText(row.dueAt)}</span> · Đạt từ <span className="text-ink">{row.minScore}%</span>{row.timeLimitMinutes ? ` · ${row.timeLimitMinutes} phút` : ""}</div>
          <div className="mt-4 flex flex-wrap gap-2"><button className={`${cx.btn} ${cx.btnDark} !px-3 !py-1.5`} onClick={() => void openDetail(row)}>Xem tiến độ</button><button className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} onClick={() => openEdit(row)}>Sửa</button><button className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} onClick={() => openDuplicate(row)}>Nhân bản</button><Link target="_blank" href={assignmentHref(row)} className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`}>Xem thử</Link><button className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5 ml-auto`} onClick={() => void toggleArchive(row)}>{row.archived ? "Khôi phục" : "Lưu trữ"}</button></div>
        </article>)}</div>}

      {formOpen && <Modal title={editing ? "Sửa bài tập" : duplicating ? "Nhân bản và giao lại" : "Giao bài mới"} onClose={() => !saving && setFormOpen(false)}>
        <form onSubmit={submit}>
          {duplicating && <div className="mb-4 rounded-lg border border-gold/40 bg-goldpale/50 p-3 text-[0.82rem]">Nội dung đã được sao chép từ <b>“{duplicating.title}”</b>. Hãy chọn lại lớp hoặc hạn nộp nếu cần; tiến độ của bản cũ không bị ảnh hưởng.</div>}
          {!editing && <label className="mb-4 flex cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-[#faf8f2] p-3 text-[0.84rem]"><input className="mt-0.5" type="checkbox" checked={bulkMode} onChange={(e) => { const enabled = e.target.checked; setBulkMode(enabled); setBulkClassIds(enabled && form.classId ? [Number(form.classId)] : []); setForm((current) => ({ ...current, classId: enabled ? "" : current.classId, setId: enabled ? "" : current.setId })); }} /><span><b>Giao cùng lúc cho nhiều lớp</b><span className="mt-0.5 block text-[0.75rem] text-muted">Mỗi lớp nhận một bản riêng để theo dõi tiến độ độc lập.</span></span></label>}
          <div className="grid gap-x-3 sm:grid-cols-2">
            {bulkMode ? <div className="mb-3 sm:col-span-2"><span className={cx.label}>Các lớp nhận bài *</span><div className="grid max-h-44 gap-1 overflow-y-auto rounded-lg border border-line bg-white p-2 sm:grid-cols-2">{classes.length ? classes.map((item) => <label key={item.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[0.82rem] hover:bg-goldpale/30"><input type="checkbox" checked={bulkClassIds.includes(item.id)} onChange={() => setBulkClassIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} /><span className="min-w-0 flex-1 truncate">{item.name}</span><span className="text-[0.7rem] text-muted">{item.memberCount} HS</span></label>) : <span className="p-2 text-sm text-muted">Chưa có lớp học.</span>}</div><div className="mt-1 text-[0.72rem] text-muted">Đã chọn {bulkClassIds.length}/{classes.length} lớp</div></div>
              : <label><span className={cx.label}>Lớp học *</span><select className={cx.input} disabled={!!editing} value={form.classId} onChange={(e) => { const nextClassId = e.target.value; setForm((current) => { const currentSet = sets.find((item) => item.id === Number(current.setId)); const canKeepSet = currentSet && (currentSet.classId === null || currentSet.classId === Number(nextClassId)); return { ...current, classId: nextClassId, setId: canKeepSet ? current.setId : "" }; }); }}><option value="">Chọn lớp</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.memberCount} học sinh)</option>)}</select></label>}
            <label className={bulkMode ? "sm:col-span-2" : ""}><span className={cx.label}>Bộ từ *</span><select className={cx.input} disabled={!!editing || (bulkMode ? bulkClassIds.length === 0 : !form.classId)} value={form.setId} onChange={(e) => { const set = sets.find((item) => item.id === Number(e.target.value)); update("setId", e.target.value); update("mode", modesForSetType(set?.type || "ielts_vocab")[0]); if (!form.title && set) update("title", set.name); }}><option value="">Chọn bộ từ{bulkMode ? " công khai" : ""}</option>{availableSets.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.count} từ){item.classId === null ? " · công khai" : ""}</option>)}</select></label>
          </div>
          <label><span className={cx.label}>Tên bài *</span><input required maxLength={256} className={cx.input} value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="VD: Ôn tập Unit 3" /></label>
          <label><span className={cx.label}>Hướng dẫn cho học sinh</span><textarea maxLength={4000} rows={3} className={cx.input} value={form.instructions} onChange={(e) => update("instructions", e.target.value)} placeholder="Nội dung cần lưu ý (không bắt buộc)" /></label>
          <div className="grid gap-x-3 sm:grid-cols-2">
            <label><span className={cx.label}>Chế độ *</span><select className={cx.input} disabled={!!editing || !form.setId} value={form.mode} onChange={(e) => update("mode", e.target.value as AssignmentMode)}>{availableModes.map((mode) => <option key={mode} value={mode}>{ASSIGNMENT_MODE_LABELS[mode]}</option>)}</select></label>
            <label><span className={cx.label}>Điểm hoàn thành (%) *</span><input type="number" min={0} max={100} required className={cx.input} value={form.minScore} onChange={(e) => update("minScore", e.target.value)} /></label>
            <label><span className={cx.label}>Hạn nộp</span><input type="datetime-local" className={cx.input} value={form.dueAt} onChange={(e) => update("dueAt", e.target.value)} /></label>
            {form.mode === "timed" && <label><span className={cx.label}>Thời gian thi (phút) *</span><input type="number" min={1} max={120} required className={cx.input} value={form.timeLimitMinutes} onChange={(e) => update("timeLimitMinutes", e.target.value)} /></label>}
          </div>
          {editing && <p className="mb-3 text-[0.78rem] text-muted">Lớp, bộ từ và chế độ được giữ nguyên để tiến độ cũ không bị sai lệch.</p>}
          <div className="flex justify-end gap-2"><button type="button" className={`${cx.btn} ${cx.btnGhost}`} onClick={() => setFormOpen(false)} disabled={saving}>Hủy</button><button type="submit" className={`${cx.btn} ${cx.btnGold}`} disabled={saving}>{saving ? "Đang lưu..." : editing ? "Lưu thay đổi" : bulkMode ? `Giao cho ${bulkClassIds.length || 0} lớp` : duplicating ? "Giao bản sao" : "Giao bài"}</button></div>
        </form>
      </Modal>}

      {detail && <Modal wide title={`Tiến độ · ${detail.assignment.title}`} onClose={() => setDetail(null)}>
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-[#faf8f2] p-3 text-sm"><span>Lớp: <b>{detail.assignment.className}</b></span><span>Yêu cầu: <b>≥ {detail.assignment.minScore}%</b></span><span>Hạn: <b>{dateText(detail.assignment.dueAt)}</b></span><button type="button" className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5 sm:ml-auto`} disabled={detailLoading || detail.students.length === 0} onClick={exportProgress}>↓ Xuất CSV</button></div>
        {detailLoading ? <div className={cx.empty}>Đang tải tiến độ...</div> : detail.students.length === 0 ? <div className={cx.empty}>Lớp chưa có học sinh.</div> : <div className="overflow-x-auto rounded-lg border border-line"><table className={cx.table}><thead><tr><th className={cx.th}>Học sinh</th><th className={cx.th}>Trạng thái</th><th className={cx.th}>Bài nộp</th><th className={cx.th}>Điểm cao nhất</th><th className={cx.th}>Số lượt</th><th className={cx.th}>Hạn riêng</th><th className={cx.th}>Hoàn thành lúc</th></tr></thead><tbody>{detail.students.map((student) => <tr key={student.userId}><td className={cx.td}><b>{student.displayName}</b><div className="text-[0.72rem] text-muted">@{student.username}</div></td><td className={cx.td}><div className={student.excused ? "font-medium text-[#654a83]" : ""}>{statusLabels[student.status]}</div><button className={`mt-1 text-[0.7rem] hover:underline ${student.excused ? "text-golddark" : "text-muted"}`} onClick={() => void toggleExcused(student)}>{student.excused ? "Yêu cầu làm lại" : "Miễn làm"}</button></td><td className={`${cx.td} min-w-40`}>{student.submission ? <><div className="text-[0.72rem] text-ok">Nộp {new Date(student.submission.submittedAt).toLocaleString("vi-VN")}</div>{student.submission.textContent && <details className="mt-1"><summary className="cursor-pointer text-[0.72rem] text-golddark">Xem nội dung</summary><div className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap rounded bg-[#faf8f2] p-2 text-[0.76rem]">{student.submission.textContent}</div></details>}{student.submission.fileName && <a className="mt-1 block text-[0.72rem] text-golddark hover:underline" href={`/api/assignments/${detail.assignment.id}/submission/file?userId=${student.userId}`}>↓ {student.submission.fileName}</a>}</> : <span className="text-muted">Chưa nộp</span>}</td><td className={cx.td}>{student.bestAccuracy === null ? "—" : `${student.bestAccuracy}%`}</td><td className={cx.td}>{student.attemptCount}</td><td className={`${cx.td} whitespace-nowrap`}>{student.extensionDueAt ? <><div className="text-ok">{dateText(student.extensionDueAt)}</div><button className="mr-2 text-[0.7rem] text-golddark hover:underline" onClick={() => openExtension(student)}>Sửa</button><button className="text-[0.7rem] text-bad hover:underline" onClick={() => void removeExtension(student)}>Bỏ</button></> : <button className={`${cx.btn} ${cx.btnGhost} !px-2 !py-1 text-[0.72rem]`} disabled={!detail.assignment.dueAt || student.excused} onClick={() => openExtension(student)}>Gia hạn</button>}</td><td className={`${cx.td} whitespace-nowrap`}>{dateText(student.completedAt)}</td></tr>)}</tbody></table></div>}
      </Modal>}
      {extensionStudent && detail && <Modal title={`Gia hạn · ${extensionStudent.displayName}`} onClose={() => !extensionSaving && setExtensionStudent(null)}>
        <form onSubmit={saveExtension}><p className={cx.desc}>Hạn chung hiện tại: <b className="text-ink">{dateText(detail.assignment.dueAt)}</b>. Hạn riêng phải muộn hơn hạn chung.</p><label><span className={cx.label}>Hạn nộp riêng *</span><input autoFocus required type="datetime-local" className={cx.input} value={extensionDueAt} onChange={(event) => setExtensionDueAt(event.target.value)} /></label><div className="flex justify-end gap-2"><button type="button" className={`${cx.btn} ${cx.btnGhost}`} disabled={extensionSaving} onClick={() => setExtensionStudent(null)}>Hủy</button><button type="submit" className={`${cx.btn} ${cx.btnGold}`} disabled={extensionSaving}>{extensionSaving ? "Đang lưu..." : "Lưu gia hạn"}</button></div></form>
      </Modal>}
    </div>
  );
}
