"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import { cx } from "@/components/ui";
import { QUESTION_SHARE_MODES, SHARE_CONTENT_KEYS, modesForSetType, type ShareContentKey, type ShareTargetType } from "@/lib/shareConfig";

const modeLabels: Record<string, string> = { learn: "Học bài", fill: "Điền từ", mc: "Trắc nghiệm", match: "Ghép cặp", dictation: "Nghe & viết", pronunciation: "Luyện phát âm", sentence: "Xếp câu", timed: "Thi thử tính giờ", practice: "Luyện câu hỏi", multiple_choice: "Trắc nghiệm", speaking: "Speaking", shuffle: "Xáo trộn câu hỏi" };
type ContentSummary = { sets: Array<{ id: number; name: string }>; documents: Array<{ id: number; title: string; fileName: string }>; counts: { quiz: number; essay: number; speaking: number } };

async function safeJson(response: Response): Promise<Record<string, any>> { const text = await response.text(); if (!text) return {}; try { const parsed = JSON.parse(text); return parsed && typeof parsed === "object" ? parsed : {}; } catch { return {}; } }

export default function ShareDialog({ targetType, targetId, title, setType, onClose }: { targetType: ShareTargetType; targetId: number; title: string; setType?: string; onClose: () => void }) {
  const modes = useMemo(() => targetType === "vocab_set" ? [...modesForSetType(setType || "ielts_vocab")] : [...QUESTION_SHARE_MODES], [setType, targetType]);
  const [accessMode, setAccessMode] = useState<"restricted" | "anyone_with_link">("restricted");
  const [allowedModes, setAllowedModes] = useState<string[]>(modes);
  const [contentSelection, setContentSelection] = useState<ShareContentKey[]>([...SHARE_CONTENT_KEYS]);
  const [includeNewContent, setIncludeNewContent] = useState(true);
  const [content, setContent] = useState<ContentSummary | null>(null);
  const [shareUrl, setShareUrl] = useState(() => { try { return localStorage.getItem(`lexora-share-url-${targetType}-${targetId}`) || ""; } catch { return ""; } });
  const [busy, setBusy] = useState(true); const [copied, setCopied] = useState(false); const [saved, setSaved] = useState(false); const [error, setError] = useState("");

  useEffect(() => { let active = true; setBusy(true); setError(""); fetch(`/api/share?targetType=${targetType}&targetId=${targetId}`).then(async (response) => { const data = await safeJson(response); if (!response.ok) throw new Error(data.error || "Không thể tải cấu hình liên kết chia sẻ."); if (!active) return; if (data.content) setContent(data.content); if (data.share) { setAccessMode(data.share.accessMode); setAllowedModes(data.share.allowedModes || modes); setContentSelection(data.share.contentSelection?.length ? data.share.contentSelection : [...SHARE_CONTENT_KEYS]); setIncludeNewContent(data.share.includeNewContent !== false); } }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Không thể tải cấu hình liên kết chia sẻ."); }).finally(() => { if (active) setBusy(false); }); return () => { active = false; }; }, [modes, targetId, targetType]);

  function toggleContent(key: ShareContentKey, checked: boolean) { setSaved(false); setContentSelection((current) => checked ? [...new Set([...current, key])] : current.filter((item) => item !== key)); }
  async function save() { setBusy(true); setError(""); setSaved(false); try { const response = await fetch("/api/share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetType, targetId, accessMode, allowedModes, contentSelection, includeNewContent }) }); const data = await safeJson(response); if (!response.ok) throw new Error(data.error || "Không thể lưu liên kết chia sẻ."); if (data.share?.url) { setShareUrl(data.share.url); try { localStorage.setItem(`lexora-share-url-${targetType}-${targetId}`, data.share.url); } catch {} } if (accessMode === "restricted") { setShareUrl(""); try { localStorage.removeItem(`lexora-share-url-${targetType}-${targetId}`); } catch {} } setSaved(true); } catch (reason) { setError(reason instanceof Error ? reason.message : "Không thể lưu liên kết chia sẻ."); } finally { setBusy(false); } }
  async function copy() { if (!shareUrl) return; await navigator.clipboard?.writeText(shareUrl); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }

  const categoryRows = content ? [
    { key: "vocab" as const, icon: "📚", label: "Bộ từ vựng", count: content.sets.length, unit: "mục", children: content.sets.map((item) => item.name) },
    { key: "quiz" as const, icon: "☑️", label: "Bộ trắc nghiệm", count: content.counts.quiz, unit: "câu", children: [] },
    { key: "essay" as const, icon: "✍️", label: "Bộ tự luận", count: content.counts.essay, unit: "câu", children: [] },
    { key: "speaking" as const, icon: "🎙️", label: "Bộ Speaking", count: content.counts.speaking, unit: "câu", children: [] },
    { key: "documents" as const, icon: "📄", label: "Tài liệu", count: content.documents.length, unit: "file", children: content.documents.map((item) => item.title || item.fileName) },
  ].filter((row) => row.count > 0) : [];

  return <Modal title={`Chia sẻ ${title}`} onClose={onClose}><div className="space-y-5">
    <fieldset><legend className="text-xs font-bold uppercase tracking-wide text-muted">Quyền truy cập chung</legend>
      <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3"><input type="radio" name="share-access" checked={accessMode === "restricted"} onChange={() => { setAccessMode("restricted"); setSaved(false); }} /><span><b className="block text-sm">Bị giới hạn</b><span className="text-xs text-muted">Chỉ tài khoản được cấp quyền.</span></span></label>
      <label className="mt-2 flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3"><input type="radio" name="share-access" checked={accessMode === "anyone_with_link"} onChange={() => { setAccessMode("anyone_with_link"); setSaved(false); }} /><span><b className="block text-sm">Bất kỳ ai có liên kết</b><span className="text-xs text-muted">Không cần đăng nhập.</span></span></label>
    </fieldset>
    {accessMode === "anyone_with_link" && targetType === "question_collection" && <fieldset><legend className="text-xs font-bold uppercase tracking-wide text-muted">Nội dung được chia sẻ</legend>
      {busy && !content ? <p className="mt-3 text-sm text-muted">Đang tải nội dung…</p> : categoryRows.length === 0 ? <p className="mt-3 rounded-xl border border-dashed border-line p-4 text-sm text-muted">Thư mục này chưa có nội dung để chia sẻ.</p> : <div className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">{categoryRows.map((row) => <label key={row.key} className="flex cursor-pointer items-start gap-3 p-3.5 hover:bg-[#FAF9FD]"><input className="mt-1 h-4 w-4 accent-[#7865EE]" type="checkbox" checked={contentSelection.includes(row.key)} onChange={(event) => toggleContent(row.key, event.target.checked)} /><span aria-hidden="true" className="mt-0.5">{row.icon}</span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-3"><b className="text-sm text-ink">{row.label}</b><span className="shrink-0 text-xs font-semibold text-muted">{row.count} {row.unit}</span></span>{row.children.length > 0 && <span className="mt-1.5 block space-y-1 text-xs text-muted">{row.children.slice(0, 4).map((name) => <span key={name} className="block truncate">{name}</span>)}{row.children.length > 4 && <span className="block font-semibold">+{row.children.length - 4} mục khác</span>}</span>}</span></label>)}</div>}
      <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl bg-[#F8F7FF] p-3 text-sm"><input className="mt-0.5 h-4 w-4 accent-[#7865EE]" type="checkbox" checked={includeNewContent} onChange={(event) => { setIncludeNewContent(event.target.checked); setSaved(false); }} /><span><b className="block">Tự động chia sẻ nội dung mới trong thư mục</b><span className="mt-0.5 block text-xs text-muted">Các nội dung mới thuộc loại đã chọn sẽ dùng cùng liên kết này.</span></span></label>
    </fieldset>}
    {accessMode === "anyone_with_link" && targetType === "vocab_set" && <fieldset><legend className="text-xs font-bold uppercase tracking-wide text-muted">Cho phép học bằng</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{modes.map((mode) => <label key={mode} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm"><input type="checkbox" checked={allowedModes.includes(mode)} onChange={(event) => { setSaved(false); setAllowedModes((current) => event.target.checked ? [...new Set([...current, mode])] : current.filter((item) => item !== mode)); }} />{modeLabels[mode] || mode}</label>)}</div></fieldset>}
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {saved && !error && <p role="status" className="text-center text-xs font-bold text-emerald-700">✓ Đã lưu quyền chia sẻ</p>}
    {shareUrl && accessMode === "anyone_with_link" && <div className="rounded-xl border border-line bg-[#FAF9FD] p-3"><input readOnly value={shareUrl} className={`${cx.input} !mb-2 text-xs`} aria-label="Liên kết chia sẻ" /><button type="button" className={`${cx.btn} ${cx.btnGhost} w-full`} onClick={() => void copy()}>{copied ? "✓ Đã sao chép liên kết" : "Sao chép liên kết"}</button></div>}
    <button type="button" className={`${cx.btn} ${cx.btnGold} w-full`} disabled={busy || (accessMode === "anyone_with_link" && (targetType === "vocab_set" ? allowedModes.length === 0 : contentSelection.length === 0))} onClick={() => void save()}>{busy ? "Đang lưu…" : shareUrl && accessMode === "anyone_with_link" ? "Lưu thay đổi" : "Lưu quyền chia sẻ"}</button>
  </div></Modal>;
}
