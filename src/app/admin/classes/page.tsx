"use client";

import { useEffect, useMemo, useState } from "react";
import { cx } from "@/components/ui";
import { toast } from "@/components/Toast";
import Modal from "@/components/Modal";
import ConfirmDialog, { type ConfirmOptions } from "@/components/ConfirmDialog";

type ClassRow = { id: number; name: string; memberCount: number };
type StudentRow = { id: number; username: string; displayName: string; isMember: boolean };

export default function AdminClassesPage() {
  const [classesList, setClassesList] = useState<ClassRow[] | null>(null);
  const [newName, setNewName] = useState("");
  const [openClassId, setOpenClassId] = useState<number | null>(null);
  const [students, setStudents] = useState<StudentRow[] | null>(null);
  const [studentQuery, setStudentQuery] = useState("");
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<{ options: ConfirmOptions; id: number } | null>(null);

  async function load() {
    const res = await fetch("/api/admin/classes");
    const data = await res.json();
    setClassesList(data.classes || []);
  }

  useEffect(() => { void load(); }, []);

  async function createClass() {
    if (!newName.trim()) return toast("Vui lòng nhập tên lớp.");
    setCreating(true);
    try {
      const res = await fetch("/api/admin/classes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName.trim() }) });
      if (!res.ok) return toast("Không thể tạo lớp.");
      toast("Đã tạo lớp học!");
      setNewName("");
      await load();
    } finally {
      setCreating(false);
    }
  }

  function confirmDelete(c: ClassRow) {
    setConfirm({ options: { title: "Xóa lớp học?", description: `${c.name} sẽ bị xóa. Các bộ từ vựng đang gán cho lớp sẽ trở thành công khai.`, confirmLabel: "Xóa lớp", tone: "danger" }, id: c.id });
  }

  async function deleteClass(id: number) {
    setConfirm(null);
    await fetch(`/api/admin/classes/${id}`, { method: "DELETE" });
    if (openClassId === id) { setOpenClassId(null); setStudents(null); }
    toast("Đã xoá lớp học.");
    await load();
  }

  async function openMembers(id: number) {
    setOpenClassId(id);
    setStudents(null);
    try {
      const res = await fetch(`/api/admin/classes/${id}/members`);
      const data = await res.json();
      setStudents(data.students || []);
    } catch {
      setStudents([]);
      toast("Không thể tải danh sách học sinh.");
    }
  }

  async function optimisticToggle(student: StudentRow, isMember: boolean) {
    if (!openClassId) return;
    if (busyIds.has(student.id)) return;
    setBusyIds((current) => new Set(current).add(student.id));
    setStudents((current) => current?.map((s) => s.id === student.id ? { ...s, isMember } : s) || current);
    setClassesList((current) => current?.map((c) => c.id === openClassId ? { ...c, memberCount: Math.max(0, c.memberCount + (isMember ? 1 : -1)) } : c) || current);
    try {
      if (isMember) {
        const res = await fetch(`/api/admin/classes/${openClassId}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: student.id }) });
        if (!res.ok) throw new Error("add failed");
      } else {
        const res = await fetch(`/api/admin/classes/${openClassId}/members?userId=${student.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("remove failed");
      }
      toast(isMember ? `Đã thêm ${student.displayName} vào lớp.` : `Đã bỏ ${student.displayName} khỏi lớp.`);
    } catch {
      toast("Không thể cập nhật học sinh. Vui lòng thử lại.");
      await openMembers(openClassId);
      await load();
    } finally {
      setBusyIds((current) => { const next = new Set(current); next.delete(student.id); return next; });
    }
  }

  function toggleAll(membership: boolean) {
    if (!students) return;
    const targets = students.filter((s) => s.isMember !== membership);
    for (const student of targets) void optimisticToggle(student, membership);
  }

  const visibleStudents = useMemo(() => {
    const q = studentQuery.trim().toLocaleLowerCase("vi");
    if (!q || !students) return students || [];
    return students.filter((s) => `${s.displayName} ${s.username}`.toLocaleLowerCase("vi").includes(q));
  }, [studentQuery, students]);

  const openClass = classesList?.find((c) => c.id === openClassId) || null;

  return (
    <div className={cx.panel}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div><h2 className={cx.h2}>Lớp học</h2><p className={cx.desc + " !mb-0"}>Tạo lớp và thêm học sinh; bộ từ gán lớp chỉ hiển thị cho lớp đó.</p></div>
        <div className="flex gap-2">
          <input className={`${cx.input} !mb-0 max-w-xs`} placeholder="Tên lớp, VD: IELTS 6.5" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void createClass(); }} />
          <button className={`${cx.btn} ${cx.btnGold}`} disabled={creating} onClick={() => void createClass()}>{creating ? "Đang tạo..." : "+ Tạo lớp"}</button>
        </div>
      </div>

      {classesList === null ? (
        <div className={cx.empty} role="status">Đang tải...</div>
      ) : classesList.length === 0 ? (
        <div className={cx.empty}>Chưa có lớp học nào.</div>
      ) : (
        <div className="space-y-2">
          {classesList.map((c) => (
            <div key={c.id} className="lexora-card flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="font-semibold">{c.name}</div>
                <div className="text-[0.78rem] text-muted">{c.memberCount} học sinh</div>
              </div>
              <div className="flex gap-2">
                <button className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} onClick={() => openMembers(c.id)}>Quản lý học sinh ›</button>
                <button className={`${cx.btn} ${cx.btnDanger} !px-3 !py-1.5`} onClick={() => confirmDelete(c)}>Xóa</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {openClass && (
        <Modal wide title={`${openClass.name} · ${openClass.memberCount} học sinh`} onClose={() => { setOpenClassId(null); setStudents(null); }}>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input type="search" className={`${cx.input} !mb-0 flex-1`} placeholder="Tìm học sinh..." value={studentQuery} onChange={(event) => setStudentQuery(event.target.value)} />
            <div className="flex gap-2">
              <button type="button" className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} onClick={() => toggleAll(true)}>Chọn tất cả</button>
              <button type="button" className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} onClick={() => toggleAll(false)}>Bỏ chọn</button>
            </div>
          </div>
          {students === null ? (
            <div className={cx.empty}>Đang tải...</div>
          ) : students.length === 0 ? (
            <div className={cx.empty}>Chưa có tài khoản học sinh nào trong hệ thống.</div>
          ) : visibleStudents.length === 0 ? (
            <div className={cx.empty}>Không tìm thấy học sinh phù hợp.</div>
          ) : (
            <div className="grid max-h-[60vh] gap-1.5 overflow-y-auto sm:grid-cols-2">
              {visibleStudents.map((s) => (
                <label key={s.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-goldpale/40 text-[0.88rem]">
                  <input type="checkbox" checked={s.isMember} disabled={busyIds.has(s.id)} onChange={() => void optimisticToggle(s, !s.isMember)} />
                  <span className="min-w-0 flex-1 truncate">{s.displayName}</span>
                  <span className="text-muted text-[0.78rem]">@{s.username}</span>
                </label>
              ))}
            </div>
          )}
          <div className="mt-4 text-[0.78rem] text-muted">Thay đổi được lưu ngay khi bạn bấm ô checkbox.</div>
        </Modal>
      )}

      <ConfirmDialog open={Boolean(confirm)} options={confirm?.options || null} onConfirm={() => { if (confirm) void deleteClass(confirm.id); }} onCancel={() => setConfirm(null)} />
    </div>
  );
}
