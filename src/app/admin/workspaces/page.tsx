"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAdminPermissions } from "@/components/AdminPermissionProvider";
import { toast } from "@/components/Toast";
import { cx } from "@/components/ui";

type Folder = { id: number; parentId: number | null; name: string; path: string | null; kind: string; archivedAt: string | null; accessLevel: "viewer" | "editor" | "manager"; counts: { sets: number; questions: number; documents: number } };
type Payload = { folders: Folder[]; personalRootId: number | null; sharedRootIds: number[]; allRootIds: number[]; canViewAll: boolean };
type AdminUser = { id: number; displayName: string; username: string; role: string };

export default function WorkspacesPage() {
  const permissions = useAdminPermissions();
  const [data, setData] = useState<Payload | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [parentId, setParentId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [sharing, setSharing] = useState<Folder | null>(null);
  const [targetUserId, setTargetUserId] = useState("");
  const [accessLevel, setAccessLevel] = useState("viewer");
  const load = async () => { const response = await fetch("/api/admin/folders", { cache: "no-store" }); const body = await response.json().catch(() => ({})); if (response.ok) { setData(body); setParentId((value) => value ?? body.personalRootId); } else toast(body.error || "Không thể tải không gian nội dung."); };
  useEffect(() => { void load(); if (permissions.can("folders.share") && permissions.can("users.view")) void fetch("/api/admin/users").then((response) => response.json()).then((body) => setUsers((body.users || []).filter((user: AdminUser) => user.role === "admin"))); }, []);
  const byParent = useMemo(() => { const map = new Map<number | null, Folder[]>(); for (const folder of data?.folders || []) map.set(folder.parentId, [...(map.get(folder.parentId) || []), folder]); return map; }, [data]);
  const renderTree = (folder: Folder, depth = 0): React.ReactNode => <div key={folder.id}>
    <div className="mb-2 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white p-3" style={{ marginLeft: Math.min(depth, 6) * 18 }}>
      <span aria-hidden>{folder.kind === "personal_root" ? "🏠" : "▤"}</span>
      <div className="min-w-0 flex-1"><b className="block truncate">{folder.name}{folder.archivedAt ? " · Đã lưu trữ" : ""}</b><span className="text-xs text-muted">{folder.counts.sets} bộ · {folder.counts.questions} câu hỏi · {folder.counts.documents} tài liệu</span></div>
      <span className="rounded-full bg-[#F0EDFF] px-2 py-1 text-xs font-bold text-[#6550DB]">{folder.accessLevel === "manager" ? "Quản lý" : folder.accessLevel === "editor" ? "Có thể chỉnh sửa" : "Chỉ xem"}</span>
      <Link className={`${cx.btn} ${cx.btnGhost} !min-h-9 !px-3`} href={`/admin/sets${folder.path ? `?category=${encodeURIComponent(folder.path)}` : ""}`}>Mở</Link>
      {permissions.can("folders.share") && folder.accessLevel === "manager" && <button className={`${cx.btn} ${cx.btnGhost} !min-h-9 !px-3`} onClick={() => setSharing(folder)}>Chia sẻ quyền</button>}
    </div>
    {(byParent.get(folder.id) || []).map((child) => renderTree(child, depth + 1))}
  </div>;
  async function createFolder(event: React.FormEvent) { event.preventDefault(); const response = await fetch("/api/admin/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, parentId }) }); const body = await response.json().catch(() => ({})); if (!response.ok) return toast(body.error || "Không thể tạo thư mục."); setName(""); await load(); toast("Đã tạo thư mục riêng tư."); }
  async function saveAccess() { if (!sharing || !targetUserId) return; const response = await fetch(`/api/admin/folders/${sharing.id}/access`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: Number(targetUserId), accessLevel: accessLevel === "inherit" ? null : accessLevel }) }); const body = await response.json().catch(() => ({})); if (!response.ok) return toast(body.error || "Không thể lưu quyền."); setSharing(null); toast(accessLevel === "inherit" ? "Đã khôi phục quyền kế thừa." : "Quyền thư mục có hiệu lực ngay lập tức."); }
  if (!data) return <div className="p-6 text-muted">Đang tải không gian nội dung…</div>;
  const personal = data.folders.find((folder) => folder.id === data.personalRootId);
  const shared = data.sharedRootIds.map((id) => data.folders.find((folder) => folder.id === id)).filter(Boolean) as Folder[];
  const allRoots = (data.allRootIds || []).map((id) => data.folders.find((folder) => folder.id === id)).filter(Boolean) as Folder[];
  return <div className="space-y-6">
    <header><p className="text-xs font-bold uppercase tracking-[.16em] text-gold">Phạm vi dữ liệu</p><h1 className="text-2xl font-black text-ink">Không gian nội dung</h1><p className="mt-1 text-sm text-muted">Quyền hệ thống quyết định bạn được làm gì; quyền thư mục quyết định bạn được làm ở đâu.</p></header>
    {permissions.can("folders.create") && <form className="flex flex-wrap gap-2 rounded-xl border border-line bg-white p-4" onSubmit={createFolder}><select className={`${cx.input} !mb-0`} value={parentId ?? ""} onChange={(event) => setParentId(Number(event.target.value))} aria-label="Thư mục cha">{data.folders.filter((folder) => folder.accessLevel === "manager").map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select><input className={`${cx.input} !mb-0 flex-1`} value={name} onChange={(event) => setName(event.target.value)} placeholder="Tên thư mục mới" aria-label="Tên thư mục mới" /><button className={`${cx.btn} ${cx.btnGold}`} disabled={!name.trim()}>Tạo thư mục</button></form>}
    <section><h2 className="mb-3 text-lg font-black">🏠 Không gian của tôi</h2>{personal ? renderTree(personal) : <p className="text-muted">Chưa có workspace.</p>}</section>
    <section><h2 className="mb-3 text-lg font-black">👥 Được chia sẻ với tôi</h2>{shared.length ? shared.map((folder) => renderTree(folder)) : <p className="rounded-xl border border-dashed border-line p-5 text-sm text-muted">Chưa có thư mục nào được chia sẻ.</p>}</section>
    {data.canViewAll && <section><h2 className="mb-3 text-lg font-black">🛡 Tất cả không gian</h2><p className="mb-3 text-sm text-muted">Owner có quyền recovery toàn hệ thống.</p>{allRoots.length ? allRoots.map((folder) => renderTree(folder)) : <p className="text-sm text-muted">Không có workspace khác.</p>}</section>}
    {sharing && <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-labelledby="share-folder-title"><div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl"><h2 id="share-folder-title" className="text-lg font-black">Chia sẻ “{sharing.name}”</h2><div className="mt-4 grid gap-3"><label><span className="mb-1 block text-sm font-bold">Quản trị viên</span><select className={`${cx.input} !mb-0`} value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)}><option value="">Chọn tài khoản</option>{users.map((user) => <option key={user.id} value={user.id}>{user.displayName} (@{user.username})</option>)}</select></label><fieldset><legend className="mb-1 text-sm font-bold">Quyền</legend><select className={`${cx.input} !mb-0`} value={accessLevel} onChange={(event) => setAccessLevel(event.target.value)}><option value="viewer">Chỉ xem</option><option value="editor">Có thể chỉnh sửa</option><option value="manager">Quản lý</option><option value="deny">Không cho truy cập</option></select></fieldset><div className="flex justify-end gap-2"><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => setSharing(null)}>Hủy</button><button className={`${cx.btn} ${cx.btnGold}`} disabled={!targetUserId} onClick={() => void saveAccess()}>Lưu</button></div></div></div></div>}
  </div>;
}
