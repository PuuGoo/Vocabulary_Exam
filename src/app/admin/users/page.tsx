"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/ui";
import { toast } from "@/components/Toast";

type UserRow = { id: number; username: string; displayName: string; role: "admin" | "student" };

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [form, setForm] = useState({ username: "", displayName: "", password: "", role: "student" as "admin" | "student" });
  const [registrationOpen, setRegistrationOpen] = useState<boolean | null>(null);
  const [savingRegistration, setSavingRegistration] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    setUsers(data.users || []);
  }

  useEffect(() => {
    load();
    fetch("/api/admin/registration-settings").then((res) => res.ok ? res.json() : null).then((data) => { if (data) setRegistrationOpen(data.open); });
  }, []);

  async function toggleRegistration() {
    if (registrationOpen === null || savingRegistration) return;
    const next = !registrationOpen;
    setSavingRegistration(true);
    try {
      const res = await fetch("/api/admin/registration-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ open: next }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast(data.error || "Không thể cập nhật trạng thái đăng ký.");
      setRegistrationOpen(data.open);
      toast(data.open ? "Đã mở đăng ký tài khoản học sinh." : "Đã khóa đăng ký công khai.");
    } finally {
      setSavingRegistration(false);
    }
  }

  async function addUser() {
    if (!form.username.trim() || !form.password) return toast("Vui lòng nhập tên đăng nhập và mật khẩu.");
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, displayName: form.displayName || form.username }),
    });
    const data = await res.json();
    if (!res.ok) return toast(data.error || "Không thể thêm người dùng.");
    toast("Đã thêm người dùng.");
    setForm({ username: "", displayName: "", password: "", role: "student" });
    load();
  }

  async function deleteUser(id: number) {
    if (!confirm("Xoá người dùng này?")) return;
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast(data.error || "Không thể xoá.");
    load();
  }

  async function generateResetLink(id: number) {
    const res = await fetch(`/api/admin/users/${id}/reset-link`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) return toast(data.error || "Không thể tạo link.");
    try {
      await navigator.clipboard.writeText(data.resetUrl);
      toast("Đã sao chép link đặt lại mật khẩu — gửi cho học sinh (Zalo/email...). Link hết hạn sau 1 giờ.");
    } catch {
      prompt("Sao chép link đặt lại mật khẩu (hết hạn sau 1 giờ):", data.resetUrl);
    }
  }

  return (
    <div className={cx.panel}>
      <h2 className={cx.h2}>Quản lý người dùng</h2>
      <div className={cx.desc}>Tạo tài khoản học sinh mới, phân quyền, hoặc xoá tài khoản.</div>

      <section className="mb-5 flex flex-col gap-3 rounded-[14px] border border-line bg-[#FBFAFE] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h3 className="text-sm font-extrabold text-ink">Đăng ký tài khoản công khai</h3><p className="mt-1 text-xs leading-5 text-muted">Khi khóa, học sinh không thể tự đăng ký; admin vẫn tạo tài khoản tại trang này.</p></div>
        <button type="button" disabled={registrationOpen === null || savingRegistration} onClick={() => void toggleRegistration()} className={`min-h-11 shrink-0 rounded-xl border px-4 text-sm font-bold transition ${registrationOpen ? "border-[#B6DEC8] bg-[#EEFBF3] text-[#277A4B]" : "border-[#F0B7B7] bg-[#FFF1F1] text-[#B64242]"}`}>{savingRegistration ? "Đang lưu..." : registrationOpen === null ? "Đang tải..." : registrationOpen ? "Đang mở · Bấm để khóa" : "Đã khóa · Bấm để mở"}</button>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className={cx.label}>Tên đăng nhập</label>
          <input className={cx.input} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </div>
        <div>
          <label className={cx.label}>Tên hiển thị</label>
          <input className={cx.input} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
        </div>
        <div>
          <label className={cx.label}>Mật khẩu</label>
          <input className={cx.input} type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <div>
          <label className={cx.label}>Vai trò</label>
          <select className={cx.input} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "admin" | "student" })}>
            <option value="student">Học sinh</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>
      <button className={`${cx.btn} ${cx.btnGold}`} onClick={addUser}>
        + Thêm người dùng
      </button>

      <table className={`${cx.table} mt-5`}>
        <thead>
          <tr>
            <th className={cx.th}>Tên đăng nhập</th>
            <th className={cx.th}>Tên hiển thị</th>
            <th className={cx.th}>Vai trò</th>
            <th className={cx.th}></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td className={cx.td}>{u.username}</td>
              <td className={cx.td}>{u.displayName}</td>
              <td className={cx.td}>
                <span className={u.role === "admin" ? cx.badgeGold : cx.badgeBlue}>{u.role === "admin" ? "Admin" : "Học sinh"}</span>
              </td>
              <td className={cx.td}>
                <div className="flex gap-1.5 flex-wrap">
                  <button className={`${cx.btn} ${cx.btnGhost} !px-2 !py-1`} onClick={() => generateResetLink(u.id)}>
                    Tạo link đặt lại mật khẩu
                  </button>
                  {u.username !== "admin" && (
                    <button className={`${cx.btn} ${cx.btnDanger} !px-2 !py-1`} onClick={() => deleteUser(u.id)}>
                      Xoá
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
