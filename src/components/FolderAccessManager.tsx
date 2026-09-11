"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "@/components/Toast";
import { cx } from "@/components/ui";

type AccessLevel = "viewer" | "editor" | "manager" | "deny";
type Candidate = { userId: number; displayName: string; username: string };
type Entry = Candidate & {
  explicitAccessLevel: AccessLevel | null;
  effectiveAccessLevel: AccessLevel;
  inheritedAccessLevel: AccessLevel | null;
  inheritedFromFolderId: number | null;
  inheritedFromFolderName: string | null;
};
type AccessPayload = {
  folder: { id: number; name: string; ownerUserId: number | null };
  entries: Entry[];
  candidates: Candidate[];
};

const ACCESS_LABELS: Record<AccessLevel, string> = {
  viewer: "Chỉ xem",
  editor: "Có thể chỉnh sửa",
  manager: "Quản lý",
  deny: "Không truy cập",
};

function matchesSearch(user: Candidate, query: string) {
  const needle = query.trim().toLocaleLowerCase("vi");
  return !needle || `${user.displayName} ${user.username}`.toLocaleLowerCase("vi").includes(needle);
}

export default function FolderAccessManager({ folderId, folderName, onClose, onChanged }: {
  folderId: number;
  folderName: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [data, setData] = useState<AccessPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [addSearch, setAddSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkLevel, setBulkLevel] = useState<AccessLevel>("editor");
  const [staged, setStaged] = useState<Record<number, AccessLevel | "inherit">>({});

  async function load() {
    setLoading(true);
    setError("");
    const response = await fetch(`/api/admin/folders/${folderId}/access`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error || "Không thể tải danh sách quyền truy cập.");
      setLoading(false);
      return;
    }
    const payload = body as AccessPayload;
    setData(payload);
    setStaged(Object.fromEntries(payload.entries.map((entry) => [entry.userId, entry.explicitAccessLevel ?? "inherit"])));
    setSelected(new Set());
    setLoading(false);
  }

  useEffect(() => { void load(); }, [folderId]);

  const visibleCandidates = useMemo(
    () => (data?.candidates || []).filter((candidate) => matchesSearch(candidate, addSearch)),
    [addSearch, data],
  );
  const visibleEntries = useMemo(
    () => (data?.entries || []).filter((entry) => matchesSearch(entry, memberSearch)),
    [data, memberSearch],
  );
  const positiveEntries = visibleEntries.filter((entry) => entry.effectiveAccessLevel !== "deny");
  const deniedEntries = visibleEntries.filter((entry) => entry.effectiveAccessLevel === "deny");
  const changedEntries = (data?.entries || []).filter((entry) => {
    const initial = entry.explicitAccessLevel ?? "inherit";
    return (staged[entry.userId] ?? initial) !== initial;
  });

  function toggle(userId: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  }

  async function submitChanges(changes: Array<{ userId: number; accessLevel: AccessLevel | null }>, success: string) {
    if (!changes.length) return;
    setSaving(true);
    const response = await fetch(`/api/admin/folders/${folderId}/access/bulk`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changes }),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      toast(body.error || `Không thể cập nhật quyền cho ${changes.length} người. Không có thay đổi nào được lưu.`);
      if (response.status === 403 || response.status === 404) await load();
      return;
    }
    toast(success);
    await load();
    onChanged?.();
  }

  const addSelected = () => submitChanges(
    [...selected].map((userId) => ({ userId, accessLevel: bulkLevel })),
    `Đã thêm quyền cho ${selected.size} quản trị viên.`,
  );
  const saveStaged = () => submitChanges(
    changedEntries.map((entry) => ({
      userId: entry.userId,
      accessLevel: staged[entry.userId] === "inherit" ? null : staged[entry.userId] as AccessLevel,
    })),
    `Đã cập nhật quyền của ${changedEntries.length} quản trị viên.`,
  );

  return <div className="fixed inset-0 z-[110] grid place-items-center bg-black/40 p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="folder-access-title">
    <section className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[90dvh] sm:max-w-4xl sm:rounded-2xl">
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.14em] text-[#6550DB]">Quản lý quyền truy cập</p>
          <h2 id="folder-access-title" className="mt-1 text-xl font-black text-ink">{folderName}</h2>
          <p className="mt-1 text-xs text-muted">Quyền thư mục không thể vượt qua quyền hệ thống của từng quản trị viên.</p>
        </div>
        <button type="button" className="min-h-10 rounded-lg border border-line px-3 font-bold" onClick={onClose} aria-label="Đóng">×</button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {loading ? <div className="grid gap-3" aria-live="polite"><div className="h-20 animate-pulse rounded-xl bg-[#F4F2FA]" /><div className="h-40 animate-pulse rounded-xl bg-[#F4F2FA]" /><p className="text-center text-sm text-muted">Đang tải quyền truy cập…</p></div>
          : error ? <div className="rounded-xl border border-bad/30 bg-badbg p-4 text-sm text-bad">{error}<button className="ml-3 font-bold underline" onClick={() => void load()}>Thử lại</button></div>
          : data && <>
            <section className="rounded-2xl border border-line bg-[#FAF9FD] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><h3 className="font-black">Thêm người</h3><p className="text-xs text-muted">Chọn nhiều quản trị viên và cấp cùng một mức quyền.</p></div>
                <button type="button" className="text-xs font-bold text-[#6550DB]" onClick={() => setSelected(new Set())}>Bỏ chọn</button>
              </div>
              <input className={`${cx.input} !mb-0 mt-3`} value={addSearch} onChange={(event) => setAddSearch(event.target.value)} placeholder="Tìm tên hoặc username…" aria-label="Tìm quản trị viên để thêm" />
              <div className="mt-3 max-h-52 overflow-y-auto rounded-xl border border-line bg-white">
                {visibleCandidates.length ? visibleCandidates.map((candidate) => <label key={candidate.userId} className="flex min-h-12 cursor-pointer items-center gap-3 border-b border-line px-3 last:border-0 hover:bg-[#F8F7FF]">
                  <input type="checkbox" checked={selected.has(candidate.userId)} onChange={() => toggle(candidate.userId)} />
                  <span className="min-w-0"><b className="block truncate text-sm">{candidate.displayName}</b><span className="text-xs text-muted">@{candidate.username}</span></span>
                </label>) : <p className="p-4 text-sm text-muted">Không còn quản trị viên phù hợp để thêm.</p>}
              </div>
              {visibleCandidates.length > 0 && <button type="button" className="mt-2 text-xs font-bold text-[#6550DB]" onClick={() => setSelected(new Set(visibleCandidates.map((candidate) => candidate.userId)))}>Chọn tất cả kết quả đang hiển thị</button>}
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="min-w-52 flex-1"><span className="mb-1 block text-xs font-bold">Quyền cấp</span><select className={`${cx.input} !mb-0`} value={bulkLevel} onChange={(event) => setBulkLevel(event.target.value as AccessLevel)}>{Object.entries(ACCESS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <button type="button" className={`${cx.btn} ${cx.btnGold}`} disabled={!selected.size || saving} onClick={() => void addSelected()}>{saving ? "Đang lưu…" : `Thêm ${selected.size} người`}</button>
              </div>
            </section>

            <section className="mt-5">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-black">Đang có quyền · {data.entries.length}</h3><p className="text-xs text-muted">Bao gồm quyền trực tiếp và quyền kế thừa từ thư mục cha.</p></div><input className={`${cx.input} !mb-0 !w-64`} value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Tìm trong danh sách…" aria-label="Tìm người đang có quyền" /></div>
              <AccessEntryList entries={positiveEntries} staged={staged} setStaged={setStaged} />
            </section>

            {deniedEntries.length > 0 && <section className="mt-5"><h3 className="font-black text-bad">Bị chặn riêng · {deniedEntries.length}</h3><p className="text-xs text-muted">Deny ghi đè quyền được kế thừa từ thư mục cha.</p><AccessEntryList entries={deniedEntries} staged={staged} setStaged={setStaged} /></section>}
          </>}
      </div>
      <footer className="flex flex-wrap justify-end gap-2 border-t border-line bg-white px-4 py-3 sm:px-6">
        <button type="button" className={`${cx.btn} ${cx.btnGhost}`} onClick={onClose}>Đóng</button>
        <button type="button" className={`${cx.btn} ${cx.btnGold}`} disabled={!changedEntries.length || saving} onClick={() => void saveStaged()}>{saving ? "Đang lưu…" : `Lưu thay đổi${changedEntries.length ? ` (${changedEntries.length})` : ""}`}</button>
      </footer>
    </section>
  </div>;
}

function AccessEntryList({ entries, staged, setStaged }: {
  entries: Entry[];
  staged: Record<number, AccessLevel | "inherit">;
  setStaged: React.Dispatch<React.SetStateAction<Record<number, AccessLevel | "inherit">>>;
}) {
  return <div className="mt-3 overflow-hidden rounded-xl border border-line">
    {entries.length ? entries.map((entry) => {
      const selected = staged[entry.userId] ?? entry.explicitAccessLevel ?? "inherit";
      const overrides = entry.explicitAccessLevel !== null && entry.inheritedAccessLevel !== null;
      return <div key={entry.userId} className="grid gap-2 border-b border-line p-3 last:border-0 sm:grid-cols-[1fr_15rem] sm:items-center">
        <div className="min-w-0">
          <b className="block truncate text-sm">{entry.displayName} <span className="font-normal text-muted">(@{entry.username})</span></b>
          <p className="mt-1 text-xs text-muted">
            {entry.explicitAccessLevel === null
              ? `${ACCESS_LABELS[entry.effectiveAccessLevel]} · Kế thừa từ “${entry.inheritedFromFolderName || "thư mục cha"}”`
              : overrides
                ? `Ghi đè ${ACCESS_LABELS[entry.inheritedAccessLevel!]} kế thừa từ “${entry.inheritedFromFolderName || "thư mục cha"}”`
                : "Quyền được cấp trực tiếp tại thư mục này"}
          </p>
        </div>
        <label><span className="sr-only">Quyền của {entry.displayName}</span><select className={`${cx.input} !mb-0`} value={selected} onChange={(event) => setStaged((current) => ({ ...current, [entry.userId]: event.target.value as AccessLevel | "inherit" }))}><option value="viewer">Chỉ xem</option><option value="editor">Có thể chỉnh sửa</option><option value="manager">Quản lý</option><option value="deny">Không truy cập</option><option value="inherit">Khôi phục quyền kế thừa</option></select></label>
      </div>;
    }) : <p className="p-4 text-sm text-muted">Không có quản trị viên phù hợp.</p>}
  </div>;
}
