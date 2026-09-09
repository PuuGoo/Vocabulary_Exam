"use client";
import { useEffect, useState } from "react";
import { cx } from "@/components/ui";
type Log = { id: number; actorDisplayName: string | null; currentActorName: string | null; action: string; resourceType: string; resourceId: string | null; createdAt: string; metadata: string };
export default function AdminAuditPage() {
  const [logs, setLogs] = useState<Log[]>([]), [query, setQuery] = useState("");
  async function load(value = query) { const response = await fetch(`/api/admin/audit${value.trim() ? `?q=${encodeURIComponent(value.trim())}` : ""}`); if (response.ok) setLogs((await response.json()).logs || []); }
  useEffect(() => { void load(""); }, []);
  return <div className={cx.panel}><div className="mb-5"><h2 className={cx.h2}>Nhật ký quản trị</h2><p className={cx.desc}>Lịch sử các thay đổi bảo mật và thao tác phá hủy quan trọng. Nhật ký chỉ đọc.</p></div><form className="mb-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); void load(); }}><input className={`${cx.input} !mb-0 flex-1`} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm actor, action hoặc resource…" /><button className={`${cx.btn} ${cx.btnGhost}`}>Tìm</button></form><div className="overflow-x-auto rounded-xl border border-line"><table className={cx.table}><thead><tr><th className={cx.th}>Thời gian</th><th className={cx.th}>Người thực hiện</th><th className={cx.th}>Hành động</th><th className={cx.th}>Đối tượng</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id}><td className={cx.td}>{new Date(log.createdAt).toLocaleString("vi-VN")}</td><td className={cx.td}>{log.currentActorName || log.actorDisplayName || "Tài khoản đã xóa"}</td><td className={cx.td}><code className="text-xs">{log.action}</code></td><td className={cx.td}>{log.resourceType}{log.resourceId ? ` #${log.resourceId}` : ""}</td></tr>)}</tbody></table>{!logs.length && <div className={cx.empty}>Chưa có sự kiện phù hợp.</div>}</div></div>;
}
