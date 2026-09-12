"use client";

import { useEffect, useMemo, useState } from "react";
import { cx } from "@/components/ui";
import { toast } from "@/components/Toast";
import Modal from "@/components/Modal";
import ConfirmDialog, { type ConfirmOptions } from "@/components/ConfirmDialog";

type UserRow = { id: number; username: string; displayName: string; role: "admin" | "student" };
type Pending = { options: ConfirmOptions; action: "delete-user" | "close-registration"; userId?: number };

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "student">("all");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ username: "", displayName: "", password: "", role: "student" as "admin" | "student" });
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
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

  async function saveRegistration(next: boolean) {
    setSavingRegistration(true);
    try {
      const res = await fetch("/api/admin/registration-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ open: next }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast(data.error || "Không thể cập nhật trạng thái đăng ký.");
      setRegistrationOpen(data.open);
      toast(data.open ? "Đã mở đăng ký tài khoản học sinh." : "Đã khóa đăng ký công khai.");
    } finally {
      setSavingRegistration(false);
      setConfirm(null);
    }
  }

  function toggleRegistration() {
    if (registrationOpen === null || savingRegistration) return;
    const next = !registrationOpen;
    if (!next) {
      setConfirm({ options: { title: "Khóa đăng ký công khai?", description: "Học sinh mới sẽ không thể tự tạo tài khoản, nhưng admin vẫn có thể tạo tài khoản tại trang này.", confirmLabel: "Khóa đăng ký", tone: "warning" }, action: "close-registration" });
      return;
    }
    void saveRegistration(true);
  }

  async function addUser() {
    if (!form.username.trim() || !form.password) return toast("Vui lòng nhập tên đăng nhập và mật khẩu.");
    setBusy(true);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, displayName: form.displayName || form.username }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return toast(data.error || "Không thể thêm người dùng.");
    toast("Đã thêm người dùng.");
    setAddOpen(false);
    setForm({ username: "", displayName: "", password: "", role: "student" });
    load();
  }

  function confirmDelete(user: UserRow) {
    setMenuFor(null);
    setConfirm({ options: { title: "Xóa người dùng?", description: `${user.displayName} (${user.username}) sẽ không thể đăng nhập. Hành động này không thể hoàn tác.`, confirmLabel: "Xóa người dùng", tone: "danger" }, action: "delete-user", userId: user.id });
  }

  async function deleteUser(id: number) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast(data.error || "Không thể xoá.");
      toast("Đã xóa người dùng.");
      load();
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function generateResetLink(id: number) {
    setMenuFor(null);
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

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase("vi");
    return users.filter((u) => {
      const matchText = !q || `${u.displayName} ${u.username}`.toLocaleLowerCase("vi").includes(q);
      const matchRole = roleFilter === "all" || u.role === roleFilter;
      return matchText && matchRole;
    });
  }, [searchQuery, roleFilter, users]);

  const total = users.length;
  const admins = users.filter((u) => u.role === "admin").length;
  const students = total - admins;

  return (
    <div className={cx.panel}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div><h2 className={cx.h2}>Người dùng</h2><p className={cx.desc + " !mb-0"}>Quản lý tài khoản học sinh và admin.</p></div>
        <button className={`${cx.btn} ${cx.btnGold}`} onClick={() => setAddOpen(true)}>+ Thêm người dùng</button>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
        <Stat value={total} label="Tổng số" />
        <Stat value={students} label="Học sinh" tone="ok" />
        <Stat value={admins} label="Admin" />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <input type="search" className={`${cx.input} !mb-0 min-w-[220px] flex-1`} placeholder="Tìm tên hoặc tài khoản..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        <select className={`${cx.input} !mb-0 !w-auto`} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}>
          <option value="all">Mọi vai trò</option>
          <option value="student">Học sinh</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      <section id="registration-settings" className={`mb-5 scroll-mt-24 rounded-[16px] border p-4 sm:p-5 ${registrationOpen === false ? "border-[#F0B7B7] bg-[#FFF7F7]" : "border-[#CFC7FF] bg-[#F8F6FF]"}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] text-lg ${registrationOpen === false ? "bg-[#FFE4E7]" : "bg-white"}`} aria-hidden="true">{registrationOpen === false ? "🔒" : "🔓"}</span><div><p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[#6550DB]">Bảo mật đăng ký</p><h3 className="mt-1 text-base font-extrabold text-ink">Cho phép học sinh tự đăng ký</h3><p className="mt-1 text-xs leading-5 text-muted">Khi tắt, trang đăng ký sẽ bị khóa; admin vẫn tạo được tài khoản tại trang này.</p></div></div>
        <button type="button" role="switch" aria-checked={registrationOpen ?? false} disabled={registrationOpen === null || savingRegistration} onClick={toggleRegistration} className={`flex min-h-12 shrink-0 items-center justify-between gap-3 rounded-full border px-3 pl-4 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#7865EE]/15 ${registrationOpen ? "border-[#B6DEC8] bg-[#EEFBF3] text-[#277A4B]" : "border-[#F0B7B7] bg-white text-[#B64242]"}`}><span>{savingRegistration ? "Đang lưu…" : registrationOpen === null ? "Đang tải…" : registrationOpen ? "Đang mở" : "Đã khóa"}</span><span className={`relative h-7 w-12 rounded-full transition ${registrationOpen ? "bg-[#36A36B]" : "bg-[#D8A0A8]"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${registrationOpen ? "translate-x-6" : "translate-x-1"}`} /></span></button></div>
      </section>

      {filteredUsers.length === 0 ? (
        <div className={cx.empty}>Không tìm thấy người dùng phù hợp.</div>
      ) : (
        <div className="hidden overflow-x-auto rounded-lg border border-line md:block">
          <table className={cx.table}>
            <thead><tr><th className={cx.th}>Tên</th><th className={cx.th}>Tài khoản</th><th className={cx.th}>Vai trò</th><th className={cx.th}></th></tr></thead>
            <tbody>
              {filteredUsers.map((u) => (
                <tr key={u.id}>
                  <td className={cx.td}>{u.displayName}</td>
                  <td className={cx.td}>@{u.username}</td>
                  <td className={cx.td}><span className={u.role === "admin" ? cx.badgeGold : cx.badgeBlue}>{u.role === "admin" ? "Admin" : "Học sinh"}</span></td>
                  <td className={cx.td}>
                    <div className="relative">
                      <button type="button" aria-haspopup="menu" aria-expanded={menuFor === u.id} onClick={() => setMenuFor(menuFor === u.id ? null : u.id)} className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1`}>•••</button>
                      {menuFor === u.id && (
                        <div role="menu" className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-line bg-white p-1.5 shadow-lg">
                          <button type="button" role="menuitem" onClick={() => generateResetLink(u.id)} className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-goldpale/40">Tạo link đặt lại mật khẩu</button>
                          {u.username !== "admin" && <button type="button" role="menuitem" onClick={() => confirmDelete(u)} className="block w-full rounded-md px-3 py-2 text-left text-sm text-bad hover:bg-badbg">Xóa người dùng</button>}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="space-y-3 md:hidden">
        {filteredUsers.map((u) => (
          <article key={u.id} className="rounded-[13px] border border-line bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div><b>{u.displayName}</b><p className="text-xs text-muted">@{u.username}</p></div>
              <span className={u.role === "admin" ? cx.badgeGold : cx.badgeBlue}>{u.role === "admin" ? "Admin" : "Học sinh"}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1 text-xs`} onClick={() => generateResetLink(u.id)}>Đặt lại mật khẩu</button>
              {u.username !== "admin" && <button className={`${cx.btn} ${cx.btnDanger} !px-3 !py-1 text-xs`} onClick={() => confirmDelete(u)}>Xóa</button>}
            </div>
          </article>
        ))}
      </div>

      {addOpen && (
        <Modal title="Thêm người dùng" onClose={() => !busy && setAddOpen(false)}>
          <div className="grid grid-cols-1 gap-3">
            <label><span className={cx.label}>Tên đăng nhập *</span><input className={cx.input} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
            <label><span className={cx.label}>Tên hiển thị</span><input className={cx.input} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></label>
            <label><span className={cx.label}>Mật khẩu *</span><input className={cx.input} type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
            <label><span className={cx.label}>Vai trò</span><select className={cx.input} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "admin" | "student" })}><option value="student">Học sinh</option><option value="admin">Admin</option></select></label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button className={`${cx.btn} ${cx.btnGhost}`} disabled={busy} onClick={() => setAddOpen(false)}>Hủy</button>
            <button className={`${cx.btn} ${cx.btnGold}`} disabled={busy} onClick={() => void addUser()}>{busy ? "Đang thêm..." : "Thêm người dùng"}</button>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        options={confirm?.options || null}
        busy={busy || savingRegistration}
        onConfirm={() => {
          if (confirm?.action === "close-registration") void saveRegistration(false);
          else if (confirm?.action === "delete-user" && confirm.userId) void deleteUser(confirm.userId);
        }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

function Stat({ value, label, tone }: { value: string | number; label: string; tone?: "ok" | "bad" }) {
  return <div className="rounded-lg border border-line bg-white p-3 text-center"><div className={`font-serif text-xl font-bold ${tone === "ok" ? "text-ok" : tone === "bad" ? "text-bad" : ""}`}>{value}</div><div className="text-[0.72rem] text-muted">{label}</div></div>;
}
