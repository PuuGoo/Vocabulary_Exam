"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import { cx } from "@/components/ui";
import { CATEGORY_SHARE_MODES, SHARE_CONTENT_KEYS, modesForSetType, type ShareContentKey, type ShareTargetType } from "@/lib/shareConfig";
import { normalizeShareSlug, shareSlugError, validateShareSlug } from "@/lib/shareSlug";
import { validateSharePassword } from "@/lib/sharePasswordPolicy";

const modeLabels: Record<string, string> = { learn: "Học bài", fill: "Điền từ", mc: "Trắc nghiệm", match: "Ghép cặp", dictation: "Nghe & viết", pronunciation: "Luyện phát âm", sentence: "Xếp câu", timed: "Thi thử tính giờ", practice: "Luyện câu hỏi", multiple_choice: "Trắc nghiệm", speaking: "Speaking", shuffle: "Xáo trộn câu hỏi" };
type ContentSummary = { sets: Array<{ id: number; name: string }>; documents: Array<{ id: number; title: string; fileName: string }>; counts: { quiz: number; essay: number; speaking: number } };
type Availability = "idle" | "checking" | "available" | "taken" | "invalid";

async function safeJson(response: Response): Promise<Record<string, any>> { const text = await response.text(); if (!text) return {}; try { const parsed = JSON.parse(text); return parsed && typeof parsed === "object" ? parsed : {}; } catch { return {}; } }

export default function ShareDialog({ targetType, targetId, title, setType, onClose }: { targetType: ShareTargetType; targetId: number; title: string; setType?: string; onClose: () => void }) {
  const modes = useMemo(() => targetType === "vocab_set" ? [...modesForSetType(setType || "ielts_vocab")] : [...CATEGORY_SHARE_MODES], [setType, targetType]);
  const storageKey = `lexora-share-url-${targetType}-${targetId}`;
  const secureStorageKey = `lexora-share-secure-url-${targetType}-${targetId}`;
  const suggestedSlug = useMemo(() => normalizeShareSlug(title), [title]);
  const [accessMode, setAccessMode] = useState<"restricted" | "anyone_with_link">("restricted");
  const [allowedModes, setAllowedModes] = useState<string[]>(modes);
  const [contentSelection, setContentSelection] = useState<ShareContentKey[]>([...SHARE_CONTENT_KEYS]);
  const [includeNewContent, setIncludeNewContent] = useState(true);
  const [content, setContent] = useState<ContentSummary | null>(null);
  const [shareId, setShareId] = useState<number | null>(null);
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [passwordConfigured, setPasswordConfigured] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [linkKind, setLinkKind] = useState<"automatic" | "custom">("automatic");
  const [slugInput, setSlugInput] = useState(suggestedSlug);
  const [savedSlug, setSavedSlug] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Availability>("idle");
  const [origin, setOrigin] = useState("");
  const [slugMessage, setSlugMessage] = useState("");
  const [shareUrl, setShareUrl] = useState(() => { try { return localStorage.getItem(storageKey) || ""; } catch { return ""; } });
  const [busy, setBusy] = useState(true); const [copied, setCopied] = useState(false); const [saved, setSaved] = useState(false); const [error, setError] = useState("");
  const normalizedSlug = normalizeShareSlug(slugInput);
  const slugDirty = linkKind === "custom" ? normalizedSlug !== (savedSlug || "") : savedSlug !== null;

  useEffect(() => { setOrigin(window.location.origin); }, []);

  useEffect(() => {
    let active = true; setBusy(true); setError("");
    fetch(`/api/share?targetType=${targetType}&targetId=${targetId}`).then(async (response) => {
      const data = await safeJson(response);
      if (!response.ok) throw new Error(data.error || "Không thể tải cấu hình liên kết chia sẻ.");
      if (!active) return;
      if (data.content) setContent(data.content);
      if (data.share) {
        setShareId(data.share.id); setAccessMode(data.share.accessMode); setAllowedModes(data.share.allowedModes || modes);
        setContentSelection(data.share.contentSelection?.length ? data.share.contentSelection : [...SHARE_CONTENT_KEYS]);
        setIncludeNewContent(data.share.includeNewContent !== false);
        setPasswordEnabled(Boolean(data.share.passwordEnabled)); setPasswordConfigured(Boolean(data.share.passwordEnabled)); setEditingPassword(false); setNewPassword("");
        const slug = data.share.customSlug || null; setSavedSlug(slug);
        if (slug) { setLinkKind("custom"); setSlugInput(slug); setAvailability("available"); if (data.share.publicUrl) setShareUrl(data.share.publicUrl); }
        else { setLinkKind("automatic"); setSlugInput(suggestedSlug); try { setShareUrl(localStorage.getItem(secureStorageKey) || localStorage.getItem(storageKey) || ""); } catch {} }
      }
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Không thể tải cấu hình liên kết chia sẻ."); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [modes, secureStorageKey, storageKey, suggestedSlug, targetId, targetType]);

  useEffect(() => {
    if (linkKind !== "custom" || accessMode !== "anyone_with_link") { setAvailability("idle"); setSlugMessage(""); return; }
    const validation = validateShareSlug(slugInput);
    if (!validation.valid) { setAvailability("invalid"); setSlugMessage(shareSlugError(validation.reason)); return; }
    if (validation.slug === savedSlug) { setAvailability("available"); setSlugMessage("Liên kết khả dụng"); return; }
    setAvailability("checking"); setSlugMessage("Đang kiểm tra…");
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/share/slug-availability?slug=${encodeURIComponent(validation.slug)}${shareId ? `&shareId=${shareId}` : ""}`, { signal: controller.signal })
        .then(async (response) => { const data = await safeJson(response); if (!response.ok) throw new Error(data.error || "Không thể kiểm tra liên kết."); setAvailability(data.available ? "available" : data.reason === "taken" ? "taken" : "invalid"); setSlugMessage(data.available ? "Liên kết khả dụng" : data.reason === "taken" ? "Liên kết này đã được sử dụng." : data.error || "Liên kết không hợp lệ."); })
        .catch((reason) => { if (reason?.name !== "AbortError") { setAvailability("invalid"); setSlugMessage("Không thể kiểm tra liên kết lúc này."); } });
    }, 400);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [accessMode, linkKind, savedSlug, shareId, slugInput]);

  function toggleContent(key: ShareContentKey, checked: boolean) { setSaved(false); setContentSelection((current) => checked ? [...new Set([...current, key])] : current.filter((item) => item !== key)); }
  function selectLinkKind(kind: "automatic" | "custom") { setLinkKind(kind); setSaved(false); if (kind === "custom" && !slugInput) setSlugInput(suggestedSlug); }
  function generatePassword() { const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"; const bytes = new Uint8Array(12); window.crypto.getRandomValues(bytes); const value = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join(""); setNewPassword(`${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8)}`); setEditingPassword(true); setPasswordVisible(true); setSaved(false); }
  async function copyPassword() { if (!newPassword) return; await navigator.clipboard?.writeText(newPassword); setPasswordCopied(true); window.setTimeout(() => setPasswordCopied(false), 1600); }
  async function save() {
    setBusy(true); setError(""); setSaved(false);
    try {
      const response = await fetch("/api/share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetType, targetId, accessMode, allowedModes, contentSelection, includeNewContent, customSlug: linkKind === "custom" ? normalizedSlug : null, passwordEnabled, ...(passwordEnabled && editingPassword && newPassword ? { newPassword } : {}) }) });
      const data = await safeJson(response);
      if (!response.ok) { if (data.code === "SHARE_SLUG_TAKEN") { setAvailability("taken"); setSlugMessage("Liên kết này vừa được sử dụng. Hãy chọn tên khác."); } throw new Error(data.error || "Không thể lưu liên kết chia sẻ."); }
      if (data.share) {
        setShareId(data.share.id || shareId); setSavedSlug(data.share.customSlug || null);
        setPasswordConfigured(Boolean(data.share.passwordEnabled)); if (data.share.passwordEnabled) setEditingPassword(false); else { setEditingPassword(false); setNewPassword(""); }
        if (data.share.secureUrl) { try { localStorage.setItem(secureStorageKey, data.share.secureUrl); } catch {} }
        let nextUrl = data.share.publicUrl || data.share.secureUrl || "";
        if (!nextUrl && linkKind === "automatic") { try { nextUrl = localStorage.getItem(secureStorageKey) || ""; } catch {} }
        if (nextUrl) { setShareUrl(nextUrl); try { localStorage.setItem(storageKey, nextUrl); } catch {} }
      }
      if (accessMode === "restricted") { setShareUrl(""); try { localStorage.removeItem(storageKey); } catch {} }
      setSaved(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Không thể lưu liên kết chia sẻ."); }
    finally { setBusy(false); }
  }
  async function copy() { if (!shareUrl || slugDirty) return; await navigator.clipboard?.writeText(shareUrl); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }

  const categoryRows = content ? [
    { key: "vocab" as const, icon: "📚", label: "Bộ từ vựng", count: content.sets.length, unit: "mục", children: content.sets.map((item) => item.name) },
    { key: "quiz" as const, icon: "☑️", label: "Bộ trắc nghiệm", count: content.counts.quiz, unit: "câu", children: [] },
    { key: "essay" as const, icon: "✍️", label: "Bộ tự luận", count: content.counts.essay, unit: "câu", children: [] },
    { key: "speaking" as const, icon: "🎙️", label: "Bộ Speaking", count: content.counts.speaking, unit: "câu", children: [] },
    { key: "documents" as const, icon: "📄", label: "Tài liệu", count: content.documents.length, unit: "file", children: content.documents.map((item) => item.title || item.fileName) },
  ].filter((row) => row.count > 0) : [];
  const slugPreview = normalizedSlug ? `${origin}/s/${normalizedSlug}` : `${origin}/s/…`;
  const slugCanSave = linkKind === "automatic" || availability === "available";
  const passwordError = passwordEnabled && editingPassword ? validateSharePassword(newPassword) : null;
  const passwordCanSave = !passwordEnabled || (passwordConfigured && !editingPassword) || (editingPassword && !passwordError);

  return <Modal title={`Chia sẻ ${title}`} onClose={onClose}><div className="space-y-5">
    <fieldset><legend className="text-xs font-bold uppercase tracking-wide text-muted">Quyền truy cập chung</legend>
      <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3"><input type="radio" name="share-access" checked={accessMode === "restricted"} onChange={() => { setAccessMode("restricted"); setSaved(false); }} /><span><b className="block text-sm">Bị giới hạn</b><span className="text-xs text-muted">Chỉ tài khoản được cấp quyền.</span></span></label>
      <label className="mt-2 flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3"><input type="radio" name="share-access" checked={accessMode === "anyone_with_link"} onChange={() => { setAccessMode("anyone_with_link"); setSaved(false); }} /><span><b className="block text-sm">Bất kỳ ai có liên kết</b><span className="text-xs text-muted">Không cần đăng nhập.</span></span></label>
    </fieldset>

    {accessMode === "anyone_with_link" && <fieldset><legend className="text-xs font-bold uppercase tracking-wide text-muted">Bảo vệ liên kết</legend><label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3"><input className="mt-0.5 h-4 w-4 accent-[#7865EE]" type="checkbox" checked={passwordEnabled} onChange={(event) => { const enabled = event.target.checked; setPasswordEnabled(enabled); setSaved(false); if (enabled && !passwordConfigured) setEditingPassword(true); if (!enabled) { setEditingPassword(false); setNewPassword(""); } }} /><span><b className="block text-sm">Yêu cầu mật khẩu</b><span className="mt-0.5 block text-xs text-muted">Người có liên kết phải nhập mật khẩu trước khi xem nội dung.</span></span></label>
      {passwordEnabled && <div className="mt-3 rounded-xl border border-line bg-white p-3">{passwordConfigured && !editingPassword ? <div className="flex flex-wrap items-center justify-between gap-3"><div><b className="block text-sm">Mật khẩu hiện tại: Đã được thiết lập</b><span className="text-xs text-muted">Nếu bạn quên, hãy đặt mật khẩu mới.</span></div><button type="button" className={`${cx.btn} ${cx.btnGhost} !min-h-10 !px-3`} onClick={() => { setEditingPassword(true); setNewPassword(""); setSaved(false); }}>Đổi mật khẩu</button></div> : <><label className={cx.label} htmlFor="share-new-password">Mật khẩu mới</label><div className={`flex rounded-lg border ${passwordError && newPassword ? "border-red-300" : "border-line focus-within:border-[#7865EE]"}`}><input id="share-new-password" className="min-h-11 min-w-0 flex-1 rounded-lg px-3 text-base outline-none" type={passwordVisible ? "text" : "password"} value={newPassword} minLength={6} maxLength={128} autoComplete="new-password" onChange={(event) => { setNewPassword(event.target.value); setSaved(false); }} /><button type="button" className="min-h-11 min-w-12 rounded-lg text-xs font-bold text-muted" onClick={() => setPasswordVisible((current) => !current)} aria-label={passwordVisible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}>{passwordVisible ? "Ẩn" : "Hiện"}</button></div>{passwordError && <p className="mt-2 text-xs text-red-700">{passwordError}</p>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" className={`${cx.btn} ${cx.btnGhost} !min-h-10 !px-3`} onClick={generatePassword}>Tạo mật khẩu ngẫu nhiên</button>{passwordConfigured && <button type="button" className={`${cx.btn} ${cx.btnGhost} !min-h-10 !px-3`} onClick={() => { setEditingPassword(false); setNewPassword(""); }}>Hủy đổi</button>}</div></>}{newPassword && <button type="button" className="mt-3 text-xs font-bold text-[#6550DB]" onClick={() => void copyPassword()}>{passwordCopied ? "✓ Đã sao chép mật khẩu" : "Sao chép mật khẩu"}</button>}</div>}
    </fieldset>}

    {accessMode === "anyone_with_link" && <fieldset><legend className="text-xs font-bold uppercase tracking-wide text-muted">Liên kết</legend><div className="mt-3 grid gap-2 sm:grid-cols-2">
      <label className={`cursor-pointer rounded-xl border p-3 ${linkKind === "automatic" ? "border-[#9787F5] bg-[#F8F7FF]" : "border-line"}`}><span className="flex items-center gap-2"><input type="radio" name="link-kind" checked={linkKind === "automatic"} onChange={() => selectLinkKind("automatic")} /><b className="text-sm">Tự động</b></span><span className="mt-1 block pl-6 text-xs text-muted">Token ngẫu nhiên, bảo mật hơn.</span></label>
      <label className={`cursor-pointer rounded-xl border p-3 ${linkKind === "custom" ? "border-[#9787F5] bg-[#F8F7FF]" : "border-line"}`}><span className="flex items-center gap-2"><input type="radio" name="link-kind" checked={linkKind === "custom"} onChange={() => selectLinkKind("custom")} /><b className="text-sm">Tùy chỉnh</b></span><span className="mt-1 block pl-6 text-xs text-muted">Dễ đọc và dễ nhớ hơn.</span></label>
    </div>{linkKind === "custom" && <div className="mt-3 rounded-xl border border-line bg-white p-3"><label className={cx.label} htmlFor="share-custom-slug">Địa chỉ tùy chỉnh</label><div className="flex items-center rounded-lg border border-line bg-white focus-within:border-[#7865EE]"><span className="hidden shrink-0 pl-3 text-xs text-muted sm:block">{origin}/s/</span><input id="share-custom-slug" className="min-h-11 min-w-0 flex-1 rounded-lg px-3 text-sm outline-none" value={slugInput} maxLength={96} autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(event) => { setSlugInput(normalizeShareSlug(event.target.value)); setSaved(false); }} onBlur={() => setSlugInput(normalizedSlug)} /></div><p className={`mt-2 text-xs font-semibold ${availability === "available" ? "text-emerald-700" : availability === "checking" ? "text-muted" : "text-red-700"}`}>{slugMessage}</p><p className="mt-2 break-all rounded-lg bg-[#FAF9FD] p-2 text-xs text-muted">{slugPreview}</p>{savedSlug && slugDirty && <p className="mt-2 text-xs text-amber-700">Thay đổi liên kết sẽ khiến địa chỉ tùy chỉnh cũ không còn hoạt động.</p>}<p className="mt-2 text-xs text-muted">Liên kết tùy chỉnh dễ nhớ hơn nhưng cũng dễ đoán hơn. Chỉ dùng với nội dung bạn sẵn sàng chia sẻ cho bất kỳ ai có liên kết.</p></div>}</fieldset>}

    {accessMode === "anyone_with_link" && targetType === "question_collection" && <fieldset><legend className="text-xs font-bold uppercase tracking-wide text-muted">Nội dung được chia sẻ</legend>{busy && !content ? <p className="mt-3 text-sm text-muted">Đang tải nội dung…</p> : categoryRows.length === 0 ? <p className="mt-3 rounded-xl border border-dashed border-line p-4 text-sm text-muted">Thư mục này chưa có nội dung để chia sẻ.</p> : <div className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">{categoryRows.map((row) => <label key={row.key} className="flex cursor-pointer items-start gap-3 p-3.5 hover:bg-[#FAF9FD]"><input className="mt-1 h-4 w-4 accent-[#7865EE]" type="checkbox" checked={contentSelection.includes(row.key)} onChange={(event) => toggleContent(row.key, event.target.checked)} /><span aria-hidden="true" className="mt-0.5">{row.icon}</span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-3"><b className="text-sm text-ink">{row.label}</b><span className="shrink-0 text-xs font-semibold text-muted">{row.count} {row.unit}</span></span>{row.children.length > 0 && <span className="mt-1.5 block space-y-1 text-xs text-muted">{row.children.slice(0, 4).map((name) => <span key={name} className="block truncate">{name}</span>)}{row.children.length > 4 && <span className="block font-semibold">+{row.children.length - 4} mục khác</span>}</span>}</span></label>)}</div>}<label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl bg-[#F8F7FF] p-3 text-sm"><input className="mt-0.5 h-4 w-4 accent-[#7865EE]" type="checkbox" checked={includeNewContent} onChange={(event) => { setIncludeNewContent(event.target.checked); setSaved(false); }} /><span><b className="block">Tự động chia sẻ nội dung mới trong thư mục</b><span className="mt-0.5 block text-xs text-muted">Các nội dung mới thuộc loại đã chọn sẽ dùng cùng liên kết này.</span></span></label></fieldset>}
    {accessMode === "anyone_with_link" && targetType === "vocab_set" && <fieldset><legend className="text-xs font-bold uppercase tracking-wide text-muted">Cho phép học bằng</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{modes.map((mode) => <label key={mode} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm"><input type="checkbox" checked={allowedModes.includes(mode)} onChange={(event) => { setSaved(false); setAllowedModes((current) => event.target.checked ? [...new Set([...current, mode])] : current.filter((item) => item !== mode)); }} />{modeLabels[mode] || mode}</label>)}</div></fieldset>}
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}{saved && !error && <p role="status" className="text-center text-xs font-bold text-emerald-700">✓ Đã lưu quyền chia sẻ</p>}
    {shareUrl && accessMode === "anyone_with_link" && <div className="rounded-xl border border-line bg-[#FAF9FD] p-3"><input readOnly value={slugDirty ? slugPreview : shareUrl} className={`${cx.input} !mb-2 text-xs`} aria-label="Liên kết chia sẻ" /><button type="button" disabled={slugDirty} className={`${cx.btn} ${cx.btnGhost} w-full disabled:cursor-not-allowed disabled:opacity-50`} onClick={() => void copy()}>{slugDirty ? "Lưu thay đổi để sử dụng liên kết này" : copied ? "✓ Đã sao chép liên kết" : "Sao chép liên kết"}</button></div>}
    <button type="button" className={`${cx.btn} ${cx.btnGold} w-full`} disabled={busy || !slugCanSave || !passwordCanSave || (accessMode === "anyone_with_link" && (targetType === "vocab_set" ? allowedModes.length === 0 : contentSelection.length === 0))} onClick={() => void save()}>{busy ? "Đang lưu…" : shareUrl && accessMode === "anyone_with_link" ? "Lưu thay đổi" : "Lưu quyền chia sẻ"}</button>
  </div></Modal>;
}
