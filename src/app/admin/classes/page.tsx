"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/ui";
import { toast } from "@/components/Toast";

type ClassRow = { id: number; name: string; memberCount: number };
type StudentRow = { id: number; username: string; displayName: string; isMember: boolean };

export default function AdminClassesPage() {
  const [classesList, setClassesList] = useState<ClassRow[] | null>(null);
  const [newName, setNewName] = useState("");
  const [openClassId, setOpenClassId] = useState<number | null>(null);
  const [students, setStudents] = useState<StudentRow[] | null>(null);

  async function load() {
    const res = await fetch("/api/admin/classes");
    const data = await res.json();
    setClassesList(data.classes || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function createClass() {
    if (!newName.trim()) return toast("Vui lòng nhập tên lớp.");
    const res = await fetch("/api/admin/classes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (!res.ok) return toast("Không thể tạo lớp.");
    toast("Đã tạo lớp học!");
    setNewName("");
    load();
  }

  async function deleteClass(id: number) {
    if (!confirm("Xoá lớp học này? Các bộ từ vựng đang gán cho lớp sẽ trở thành công khai.")) return;
    await fetch(`/api/admin/classes/${id}`, { method: "DELETE" });
    if (openClassId === id) setOpenClassId(null);
    toast("Đã xoá lớp học.");
    load();
  }

  async function openMembers(id: number) {
    setOpenClassId(id);
    const res = await fetch(`/api/admin/classes/${id}/members`);
    const data = await res.json();
    setStudents(data.students || []);
  }

  async function toggleMember(studentId: number, isMember: boolean) {
    if (!openClassId) return;
    if (isMember) {
      await fetch(`/api/admin/classes/${openClassId}/members?userId=${studentId}`, { method: "DELETE" });
    } else {
      await fetch(`/api/admin/classes/${openClassId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: studentId }),
      });
    }
    openMembers(openClassId);
    load();
  }

  return (
    <div className={cx.panel}>
      <h2 className={cx.h2}>Lớp học</h2>
      <div className={cx.desc}>
        Tạo lớp học và thêm học sinh vào lớp. Khi tạo bộ từ vựng, bạn có thể gán riêng cho một lớp — chỉ học sinh
        trong lớp đó mới nhìn thấy; bộ không gán lớp sẽ hiển thị công khai cho mọi học sinh.
      </div>

      <div className="flex gap-2.5 mb-4 flex-wrap">
        <input
          className={`${cx.input} !mb-0 flex-1 min-w-[200px]`}
          placeholder="Tên lớp, VD: IELTS 6.5 - Tối 3-5-7"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button className={`${cx.btn} ${cx.btnGold}`} onClick={createClass}>
          + Tạo lớp
        </button>
      </div>

      {classesList === null ? (
        <div className={cx.empty}>Đang tải...</div>
      ) : classesList.length === 0 ? (
        <div className={cx.empty}>Chưa có lớp học nào.</div>
      ) : (
        classesList.map((c) => (
          <div key={c.id}>
            <div className={cx.setcard}>
              <div>
                <div className="font-semibold">{c.name}</div>
                <div className="text-[0.78rem] text-muted mt-0.5">{c.memberCount} học sinh</div>
              </div>
              <div className="flex gap-2.5">
                <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => (openClassId === c.id ? setOpenClassId(null) : openMembers(c.id))}>
                  {openClassId === c.id ? "Đóng" : "Quản lý học sinh"}
                </button>
                <button className={`${cx.btn} ${cx.btnDanger}`} onClick={() => deleteClass(c.id)}>
                  Xoá
                </button>
              </div>
            </div>
            {openClassId === c.id && (
              <div className="border border-line rounded-[10px] p-4 mb-3 bg-white -mt-1.5">
                <div className={cx.desc}>Chọn học sinh thuộc lớp này:</div>
                {students === null ? (
                  <div className={cx.empty}>Đang tải...</div>
                ) : students.length === 0 ? (
                  <div className={cx.empty}>Chưa có tài khoản học sinh nào trong hệ thống.</div>
                ) : (
                  <div className="flex flex-col gap-1.5 max-h-[300px] overflow-auto">
                    {students.map((s) => (
                      <label key={s.id} className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-goldpale/40 cursor-pointer text-[0.88rem]">
                        <input type="checkbox" checked={s.isMember} onChange={() => toggleMember(s.id, s.isMember)} />
                        <span>{s.displayName}</span>
                        <span className="text-muted text-[0.78rem]">@{s.username}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
