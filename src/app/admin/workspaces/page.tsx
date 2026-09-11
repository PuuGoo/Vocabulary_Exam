"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAdminPermissions } from "@/components/AdminPermissionProvider";
import { toast } from "@/components/Toast";
import { cx } from "@/components/ui";
import FolderAccessManager from "@/components/FolderAccessManager";

type Folder = { id: number; parentId: number | null; name: string; path: string | null; kind: string; archivedAt: string | null; accessLevel: "viewer" | "editor" | "manager"; counts: { sets: number; questions: number; documents: number } };
type Payload = { folders: Folder[]; personalRootId: number | null; sharedRootIds: number[]; allRootIds: number[]; canViewAll: boolean };

export default function WorkspacesPage() {
  const permissions = useAdminPermissions();
  const [data, setData] = useState<Payload | null>(null);
  const [parentId, setParentId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [sharing, setSharing] = useState<Folder | null>(null);
  const load = async () => { const response = await fetch("/api/admin/folders", { cache: "no-store" }); const body = await response.json().catch(() => ({})); if (response.ok) { setData(body); setParentId((value) => value ?? body.personalRootId); } else toast(body.error || "Không thể tải không gian nội dung."); };
  useEffect(() => { void load(); }, []);
  const byParent = useMemo(() => { const map = new Map<number | null, Folder[]>(); for (const folder of data?.folders || []) map.set(folder.parentId, [...(map.get(folder.parentId) || []), folder]); return map; }, [data]);
  const renderTree = (folder: Folder, depth = 0): React.ReactNode => <div key={folder.id}>
    <div className="mb-2 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white p-3" style={{ marginLeft: Math.min(depth, 6) * 18 }}>
      <span aria-hidden>{folder.kind === "personal_root" ? "🏠" : "▤"}</span>
      <div className="min-w-0 flex-1"><b className="block truncate">{folder.name}{folder.archivedAt ? " · Đã lưu trữ" : ""}</b><span className="text-xs text-muted">{folder.counts.sets} bộ · {folder.counts.questions} câu hỏi · {folder.counts.documents} tài liệu</span></div>
      <span className="rounded-full bg-[#F0EDFF] px-2 py-1 text-xs font-bold text-[#6550DB]">{folder.accessLevel === "manager" ? "Quản lý" : folder.accessLevel === "editor" ? "Có thể chỉnh sửa" : "Chỉ xem"}</span>
      <Link className={`${cx.btn} ${cx.btnGhost} !min-h-9 !px-3`} href={`/admin/sets${folder.path ? `?category=${encodeURIComponent(folder.path)}` : ""}`}>Mở</Link>
      {permissions.can("folders.share") && folder.accessLevel === "manager" && <button className={`${cx.btn} ${cx.btnGhost} !min-h-9 !px-3`} onClick={() => setSharing(folder)}>Quản lý quyền truy cập</button>}
    </div>
    {(byParent.get(folder.id) || []).map((child) => renderTree(child, depth + 1))}
  </div>;
  async function createFolder(event: React.FormEvent) { event.preventDefault(); const response = await fetch("/api/admin/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, parentId }) }); const body = await response.json().catch(() => ({})); if (!response.ok) return toast(body.error || "Không thể tạo thư mục."); setName(""); await load(); toast("Đã tạo thư mục riêng tư."); }
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
    {sharing && <FolderAccessManager folderId={sharing.id} folderName={sharing.name} onClose={() => setSharing(null)} onChanged={() => void load()} />}
  </div>;
}
