"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { toast } from "@/components/Toast";
import { cx } from "@/components/ui";
import { useAdminPermissions } from "@/components/AdminPermissionProvider";
import {
  ADMIN_PERMISSION_GROUPS, ADMIN_PERMISSION_LABELS, ADMIN_PROFILES,
  ADMIN_PROFILE_LABELS, ADMIN_PROFILE_PERMISSIONS, normalizePermissionSelection,
  type AdminPermission, type AdminProfile,
} from "@/lib/adminPermissions";

type UserRow = { id: number; username: string; displayName: string; role: "admin" | "student"; adminProfile: AdminProfile | null; permissions: AdminPermission[] };
const emptyForm = { username: "", displayName: "", password: "", role: "student" as "admin" | "student", adminProfile: "viewer" as AdminProfile };

export default function AdminUsersPage() {
  const access = useAdminPermissions();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [permissionUser, setPermissionUser] = useState<UserRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [profile, setProfile] = useState<AdminProfile>("viewer");
  const [permissions, setPermissions] = useState<AdminPermission[]>([]);
  const [registration, setRegistration] = useState<boolean | null>(null);

  async function load() {
    const response = await fetch("/api/admin/users");
    const data = await response.json().catch(() => ({}));
    if (response.ok) setUsers(data.users || []);
  }
  useEffect(() => {
    void load();
    if (access.can("registration.view")) void fetch("/api/admin/registration-settings").then((response) => response.ok ? response.json() : null).then((data) => data && setRegistration(data.open));
  }, []);

  const filtered = useMemo(() => users.filter((user) => {
    const matchesRole = roleFilter === "all" || user.role === roleFilter || user.adminProfile === roleFilter;
    return matchesRole && `${user.displayName} ${user.username}`.toLocaleLowerCase("vi").includes(search.trim().toLocaleLowerCase("vi"));
  }), [users, roleFilter, search]);

  async function addUser() {
    if (form.role === "admin" && form.adminProfile === "owner") {
      const accepted = await confirm({ title: "Cấp toàn quyền Owner?", description: "Người này sẽ có thể thay đổi quyền của mọi quản trị viên và khôi phục dữ liệu.", confirmLabel: "Cấp quyền Owner", tone: "warning" });
      if (!accepted) return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return toast(data.error || "Không thể thêm người dùng.");
      setAddOpen(false); setForm(emptyForm); await load(); toast("Đã thêm người dùng.");
    } finally { setBusy(false); }
  }
  async function remove(user: UserRow) {
    const accepted = await confirm({ title: "Xóa tài khoản?", description: `${user.displayName} (@${user.username}) sẽ bị xóa.`, confirmLabel: "Xóa tài khoản", tone: "danger" });
    if (!accepted) return;
    const response = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return toast(data.error || "Không thể xóa.");
    await load();
  }
  async function reset(user: UserRow) {
    const response = await fetch(`/api/admin/users/${user.id}/reset-link`, { method: "POST" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return toast(data.error || "Không thể tạo liên kết.");
    await navigator.clipboard.writeText(data.resetUrl); toast("Đã sao chép liên kết đặt lại mật khẩu.");
  }
  function editPermissions(user: UserRow) { setPermissionUser(user); setProfile(user.adminProfile || "viewer"); setPermissions(user.permissions || []); }
  function chooseProfile(next: AdminProfile) { setProfile(next); setPermissions([...ADMIN_PROFILE_PERMISSIONS[next]]); }
  function toggle(permission: AdminPermission) {
    setProfile("custom");
    const removing = permissions.includes(permission);
    const prefix = `${permission.split(".")[0]}.`;
    const next = removing && permission.endsWith(".view") ? permissions.filter((item) => !item.startsWith(prefix)) : removing ? permissions.filter((item) => item !== permission) : [...permissions, permission];
    setPermissions(normalizePermissionSelection(next));
  }
  function toggleGroup(groupPermissions: readonly AdminPermission[]) {
    setProfile("custom");
    const allEnabled = groupPermissions.every((permission) => permissions.includes(permission));
    const group = new Set(groupPermissions);
    setPermissions(normalizePermissionSelection(allEnabled ? permissions.filter((permission) => !group.has(permission)) : [...permissions, ...groupPermissions]));
  }
  async function savePermissions() {
    if (!permissionUser) return;
    if (profile === "owner" || permissions.includes("permissions.manage") || permissions.includes("backup.restore")) {
      const accepted = await confirm({ title: profile === "owner" ? "Cấp toàn quyền Owner?" : "Cấp quyền quản trị nhạy cảm?", description: "Thay đổi này cho phép quản lý quyền hoặc khôi phục dữ liệu. Hãy xác nhận người nhận thực sự cần quyền này.", confirmLabel: "Xác nhận cấp quyền", tone: "warning" });
      if (!accepted) return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/users/${permissionUser.id}/permissions`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile, permissions }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return toast(data.error || "Không thể lưu quyền.");
      setPermissionUser(null); await load(); toast("Đã cập nhật quyền quản trị.");
    } finally { setBusy(false); }
  }
  async function toggleRegistration() {
    if (registration == null || !access.can("registration.manage")) return;
    const response = await fetch("/api/admin/registration-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ open: !registration }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return toast(data.error || "Không thể cập nhật.");
    setRegistration(data.open);
  }

  const actions = (user: UserRow) => <div className="flex flex-wrap gap-1">
    {access.can("users.reset_password") && <button className={`${cx.btn} ${cx.btnGhost} !px-2 !py-1 text-xs`} onClick={() => void reset(user)}>Đặt lại MK</button>}
    {user.role === "admin" && access.can("permissions.manage") && <button className={`${cx.btn} ${cx.btnGhost} !px-2 !py-1 text-xs`} onClick={() => editPermissions(user)}>Phân quyền</button>}
    {access.can("users.delete") && <button className={`${cx.btn} ${cx.btnDanger} !px-2 !py-1 text-xs`} onClick={() => void remove(user)}>Xóa</button>}
  </div>;

  return <div className={cx.panel}>
    {confirmDialog}
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className={cx.h2}>Người dùng & phân quyền</h2><p className={cx.desc}>Quản lý tài khoản và quyền truy cập khu vực Admin.</p></div>{access.can("users.create") && <button className={`${cx.btn} ${cx.btnGold}`} onClick={() => setAddOpen(true)}>+ Thêm người dùng</button>}</div>
    {access.can("registration.view") && <section className="mb-5 flex items-center justify-between rounded-2xl border border-line bg-[#F8F6FF] p-4"><div><b>Đăng ký công khai</b><p className="text-xs text-muted">Cho phép học sinh tự tạo tài khoản.</p></div><button type="button" role="switch" aria-checked={registration || false} disabled={!access.can("registration.manage") || registration == null} onClick={() => void toggleRegistration()} className={`${cx.btn} ${registration ? cx.btnGold : cx.btnGhost}`}>{registration == null ? "Đang tải…" : registration ? "Đang mở" : "Đã khóa"}</button></section>}
    <div className="mb-4 flex flex-wrap gap-2"><input className={`${cx.input} !mb-0 min-w-52 flex-1`} type="search" placeholder="Tìm tên hoặc tài khoản…" value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label="Lọc loại tài khoản" className={`${cx.input} !mb-0 !w-auto`} value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="all">Tất cả</option><option value="student">Học sinh</option><option value="admin">Admin</option>{ADMIN_PROFILES.map((item) => <option key={item} value={item}>{ADMIN_PROFILE_LABELS[item]}</option>)}</select></div>
    <div className="space-y-2 md:hidden">{filtered.map((user) => <article key={user.id} className="rounded-xl border border-line bg-white p-4"><div className="flex items-start justify-between gap-2"><div><b>{user.displayName}</b><p className="text-xs text-muted">@{user.username}</p></div><ProfileBadge user={user} /></div><div className="mt-3">{actions(user)}</div></article>)}</div>
    <div className="hidden overflow-x-auto rounded-xl border border-line md:block"><table className={cx.table}><thead><tr><th className={cx.th}>Tên</th><th className={cx.th}>Tài khoản</th><th className={cx.th}>Loại</th><th className={cx.th}>Quyền quản trị</th><th className={cx.th}>Actions</th></tr></thead><tbody>{filtered.map((user) => <tr key={user.id}><td className={cx.td}><b>{user.displayName}</b></td><td className={cx.td}>@{user.username}</td><td className={cx.td}>{user.role === "admin" ? "Admin" : "Học sinh"}</td><td className={cx.td}><ProfileBadge user={user} /></td><td className={cx.td}>{actions(user)}</td></tr>)}</tbody></table></div>
    {addOpen && <Modal title="Thêm người dùng" onClose={() => !busy && setAddOpen(false)}><div className="space-y-3"><Field label="Tên đăng nhập"><input className={cx.input} value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></Field><Field label="Tên hiển thị"><input className={cx.input} value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></Field><Field label="Mật khẩu"><input className={cx.input} type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></Field><Field label="Loại tài khoản"><select className={cx.input} value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as "admin" | "student" })}><option value="student">Học sinh</option><option value="admin" disabled={!access.can("permissions.manage")}>Admin</option></select></Field>{form.role === "admin" && <Field label="Quyền quản trị"><select className={cx.input} value={form.adminProfile} onChange={(event) => setForm({ ...form, adminProfile: event.target.value as AdminProfile })}>{ADMIN_PROFILES.map((item) => <option key={item} value={item}>{ADMIN_PROFILE_LABELS[item]}</option>)}</select></Field>}</div><Actions busy={busy} cancel={() => setAddOpen(false)} save={() => void addUser()} /></Modal>}
    {permissionUser && <Modal title={`Phân quyền · ${permissionUser.displayName}`} onClose={() => !busy && setPermissionUser(null)}><Field label="Profile"><select className={cx.input} value={profile} onChange={(event) => chooseProfile(event.target.value as AdminProfile)}>{ADMIN_PROFILES.map((item) => <option key={item} value={item}>{ADMIN_PROFILE_LABELS[item]}</option>)}</select></Field>{profile === "owner" ? <p className="rounded-xl border border-[#E8D99B] bg-[#FFF9DF] p-3 text-sm">Owner có toàn bộ quyền, bao gồm phân quyền và khôi phục dữ liệu.</p> : <div className="max-h-[55vh] space-y-3 overflow-y-auto">{ADMIN_PERMISSION_GROUPS.map((group) => { const allEnabled = group.permissions.every((permission) => permissions.includes(permission)); return <fieldset key={group.label} className="rounded-xl border border-line p-3"><legend className="px-1 text-sm font-extrabold">{group.label}</legend><button type="button" className="mb-2 text-xs font-bold text-gold hover:underline" onClick={() => toggleGroup(group.permissions)}>{allEnabled ? "Tắt cả nhóm" : "Bật tất cả"}</button><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{group.permissions.map((permission) => <label key={permission} className="flex min-h-10 items-center gap-2 rounded-lg bg-[#F8F7FC] px-3 text-sm"><input type="checkbox" checked={permissions.includes(permission)} onChange={() => toggle(permission)} /><span>{ADMIN_PERMISSION_LABELS[permission]}</span></label>)}</div></fieldset>; })}</div>}<Actions busy={busy} cancel={() => setPermissionUser(null)} save={() => void savePermissions()} /></Modal>}
  </div>;
}

function ProfileBadge({ user }: { user: UserRow }) { return user.adminProfile ? <span className={user.adminProfile === "owner" ? cx.badgeGold : cx.badgeBlue}>{ADMIN_PROFILE_LABELS[user.adminProfile]}</span> : <span>—</span>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label><span className={cx.label}>{label}</span>{children}</label>; }
function Actions({ busy, cancel, save }: { busy: boolean; cancel(): void; save(): void }) { return <div className="mt-4 flex justify-end gap-2"><button className={`${cx.btn} ${cx.btnGhost}`} disabled={busy} onClick={cancel}>Hủy</button><button className={`${cx.btn} ${cx.btnGold}`} disabled={busy} onClick={save}>{busy ? "Đang lưu…" : "Lưu"}</button></div>; }
