"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { toast } from "@/components/Toast";
import { BACKUP_COLLECTIONS, BackupCollection } from "@/lib/backup";

const STORAGE_KEY = "lexora_last_backup_at";
const CONFIRMATION = "KHOI PHUC";
const MAX_UPLOAD_BYTES = 750 * 1024 * 1024; // 750 MB raw upload cap (chunked server-side).
const UPLOAD_CONCURRENCY = 3;

const LABELS: Record<BackupCollection, string> = {
  users: "Tài khoản", classes: "Lớp học", classMembers: "Thành viên lớp", vocabCategories: "Danh mục", categoryDocuments: "Tài liệu PDF", vocabSets: "Bộ từ",
  words: "Từ vựng", attempts: "Lượt luyện tập", assignments: "Bài tập", assignmentExtensions: "Gia hạn",
  assignmentSubmissions: "Bài nộp", teachBackNotes: "Ghi chú giảng lại", mistakes: "Từ hay sai",
  wordProgress: "Tiến độ từ", wordBookmarks: "Từ đã lưu", studySessions: "Phiên học",
  learningGoals: "Mục tiêu", dailyActivities: "Hoạt động ngày",
  appSettings: "Cấu hình hệ thống",
};

async function uploadFileInChunks(file: File, onProgress: (received: number, total: number) => void): Promise<string> {
  const total = file.size;
  const start = await fetch("/api/admin/backup/restore/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ originalName: file.name, totalBytes: total }),
  }).then(async (r) => {
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Không thể khởi tạo phiên khôi phục.");
    return data as { sessionId: string; chunkSize: number; expectedChunks: number; totalBytes: number };
  });
  const { sessionId, chunkSize, expectedChunks } = start;
  let cancelled = false;
  let next = 0;
  let received = 0;
  const tryUploadOne = async () => {
    while (!cancelled) {
      const index = next++;
      if (index >= expectedChunks) return;
      const begin = index * chunkSize;
      const end = Math.min(begin + chunkSize, total);
      const blob = file.slice(begin, end);
      const buf = await blob.arrayBuffer();
      const response = await fetch(`/api/admin/backup/restore/chunk?session=${sessionId}&index=${index}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: buf,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        cancelled = true;
        throw new Error(payload.error || `Phân đoạn ${index} thất bại.`);
      }
      received += end - begin;
      onProgress(received, total);
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, expectedChunks) }, () => tryUploadOne()));
  } catch (error) {
    await fetch("/api/admin/backup/restore/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    }).catch(() => undefined);
    throw error;
  }
  return sessionId;
}

type Preview = { createdAt: string; version: number; integrity: "verified" | "legacy"; counts: Record<BackupCollection, number>; unknownUsers: string[]; strategy: string };
type RestoreReport = { added: Record<BackupCollection, number>; skipped: Record<BackupCollection, number>; warnings: string[] };
type EmailSchedule = { enabled: boolean; recipient: string; hour?: number; timezone?: string; lastSentAt: string; lastError: string; lastCronAt: string; lastAttemptAt: string; lastAttemptStatus: string };

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  URL.revokeObjectURL(url);
}

export default function BackupPage() {
  const [downloading, setDownloading] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [backup, setBackup] = useState<unknown>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ received: number; total: number } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [report, setReport] = useState<RestoreReport | null>(null);
  const [emailSchedule, setEmailSchedule] = useState<EmailSchedule>({ enabled: false, recipient: "", hour: 0, timezone: "Asia/Ho_Chi_Minh", lastSentAt: "", lastError: "", lastCronAt: "", lastAttemptAt: "", lastAttemptStatus: "" });
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [cronConfigured, setCronConfigured] = useState(false);

  useEffect(() => {
    setLastBackupAt(localStorage.getItem(STORAGE_KEY));
    fetch("/api/admin/backup/schedule", { cache: "no-store" })
      .then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error); return payload; })
      .then((payload) => { setEmailSchedule(payload.schedule); setEmailConfigured(payload.emailConfigured); setCronConfigured(payload.cronConfigured); })
      .catch((error) => toast(error instanceof Error ? error.message : "Không thể tải lịch sao lưu."))
      .finally(() => setScheduleLoading(false));
  }, []);

  async function saveSchedule() {
    if (!emailSchedule.recipient.trim()) return toast("Vui lòng nhập email nhận bản sao lưu.");
    setScheduleSaving(true);
    try {
      const response = await fetch("/api/admin/backup/schedule", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(emailSchedule) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Không thể lưu lịch sao lưu.");
      setEmailSchedule(payload.schedule); toast("Đã lưu lịch gửi sao lưu tự động.");
    } catch (error) { toast(error instanceof Error ? error.message : "Không thể lưu lịch sao lưu."); }
    finally { setScheduleSaving(false); }
  }

  async function sendTestEmail() {
    if (!emailSchedule.recipient.trim()) return toast("Vui lòng nhập email nhận trước.");
    setTestingEmail(true);
    try {
      const response = await fetch("/api/admin/backup/schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipient: emailSchedule.recipient }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Không thể gửi email thử.");
      toast("Đã gửi bản sao lưu thử. Hãy kiểm tra hộp thư và thư rác.");
    } catch (error) { toast(error instanceof Error ? error.message : "Không thể gửi email thử."); }
    finally { setTestingEmail(false); }
  }

  async function downloadBackup(showToast = true) {
    setDownloading(true);
    try {
      const response = await fetch("/api/admin/backup", { cache: "no-store" });
      if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.error || "Không thể tạo bản sao lưu."); }
      const blob = await response.blob();
      const filename = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] || "lexora-backup.json";
      saveBlob(blob, filename);
      const completedAt = new Date().toISOString(); localStorage.setItem(STORAGE_KEY, completedAt); setLastBackupAt(completedAt);
      if (showToast) toast("Đã tải bản sao lưu dữ liệu.");
      return true;
    } catch (error) {
      toast(error instanceof Error ? error.message : "Không thể tạo bản sao lưu.");
      return false;
    } finally { setDownloading(false); }
  }

  async function inspectFile(file?: File) {
    setBackup(null); setPreview(null); setReport(null); setConfirmation(""); setUploadProgress(null); setFileName(file?.name || "");
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) { toast(`File lớn hơn ${(MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(0)} MB. Hãy kiểm tra lại.`); setFileName(""); return; }
    setPreviewing(true);
    try {
      const sessionId = await uploadFileInChunks(file, (received, total) => setUploadProgress({ received, total }));
      const response = await fetch("/api/admin/backup/restore/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", sessionId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Không thể đọc file sao lưu.");
      setBackup({ sessionId }); setPreview(payload); toast("File hợp lệ. Hãy kiểm tra bản xem trước.");
    } catch (error) { setFileName(""); toast(error instanceof Error ? error.message : "File JSON không hợp lệ."); }
    finally { setPreviewing(false); setUploadProgress(null); }
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    await inspectFile(file);
  }

  async function restoreBackup() {
    if (!backup || !preview || confirmation !== CONFIRMATION || restoring) return;
    setRestoring(true); setReport(null);
    try {
      const backedUp = await downloadBackup(false);
      if (!backedUp) throw new Error("Đã dừng khôi phục vì chưa thể sao lưu dữ liệu hiện tại.");
      const session = (backup as { sessionId?: string } | null)?.sessionId;
      if (!session) throw new Error("Phiên khôi phục đã hết hạn. Hãy chọn lại file.");
      const response = await fetch("/api/admin/backup/restore/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", confirmation, sessionId: session }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Không thể khôi phục dữ liệu.");
      setReport(payload.report); setConfirmation(""); toast("Khôi phục hoàn tất. Dữ liệu hiện có vẫn được giữ nguyên.");
    } catch (error) { toast(error instanceof Error ? error.message : "Không thể khôi phục dữ liệu."); }
    finally { setRestoring(false); }
  }

  return <div className="lexora-page-enter mx-auto max-w-5xl space-y-6">
    <section><p className="mb-2 text-sm font-semibold text-gold">Quản trị / An toàn dữ liệu</p><h1 className="text-[clamp(1.8rem,4vw,2.5rem)] font-extrabold tracking-[-0.045em]">Sao lưu và khôi phục</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted">Giữ một bản dữ liệu ngoại tuyến và gộp lại an toàn khi cần. Hệ thống không ghi đè tài khoản, mật khẩu hay dữ liệu đang có.</p></section>

    <section className="grid gap-5 lg:grid-cols-2">
      <article className="lexora-card overflow-hidden"><div className="border-b border-line bg-[#F8F7FC] p-5 sm:p-6"><div className="flex items-start gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-[#EAE7FF] text-xl text-[#6550DB]">↓</span><div><h2 className="font-extrabold">Tạo bản sao lưu mới</h2><p className="mt-1 text-sm leading-6 text-muted">Bao gồm tài khoản, cấu hình, lớp, bộ từ, tiến độ, bài làm, ghi chú và file đã tải lên.</p></div></div></div><div className="p-5 sm:p-6"><dl className="grid gap-3 text-sm sm:grid-cols-2"><div className="rounded-[13px] border border-line p-4"><dt className="text-xs font-semibold text-muted">Định dạng</dt><dd className="mt-1 font-bold">Lexora JSON v2 · SHA-256</dd></div><div className="rounded-[13px] border border-line p-4"><dt className="text-xs font-semibold text-muted">Lần tải trên thiết bị này</dt><dd className="mt-1 font-bold">{lastBackupAt ? new Date(lastBackupAt).toLocaleString("vi-VN") : "Chưa có"}</dd></div></dl><button type="button" onClick={() => void downloadBackup()} disabled={downloading || restoring} className="mt-6 inline-flex h-12 items-center justify-center rounded-[12px] bg-gold px-5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-golddark disabled:cursor-wait disabled:opacity-60">{downloading ? "Đang đóng gói và kiểm tra…" : "Tải bản sao lưu an toàn"}</button></div></article>

      <article className="lexora-card overflow-hidden"><div className="border-b border-line bg-[#F8F7FC] p-5 sm:p-6"><div className="flex items-start gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-[#E8F6EF] text-xl text-[#267A52]">↥</span><div><h2 className="font-extrabold">Khôi phục từ file JSON</h2><p className="mt-1 text-sm leading-6 text-muted">Kiểm tra toàn vẹn trước, chỉ thêm dữ liệu còn thiếu và tự tải bản sao hiện tại.</p></div></div></div><div className="p-5 sm:p-6"><label onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void inspectFile(event.dataTransfer.files?.[0]); }} className="group flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-[14px] border-2 border-dashed border-[#D9D5EC] bg-[#FAF9FD] px-4 text-center transition hover:border-[#8A79E7] hover:bg-[#F7F5FF]"><span className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg text-[#6550DB] shadow-sm transition group-hover:-translate-y-0.5">↥</span><span className="text-sm font-bold text-main">{previewing ? (uploadProgress ? "Đang tải lên… " + (uploadProgress.received / 1024 / 1024).toFixed(1) + "/" + (uploadProgress.total / 1024 / 1024).toFixed(1) + " MB" : "Đang kiểm tra và khôi phục…") : fileName || "Kéo thả hoặc chọn file sao lưu"}</span><span className="mt-1 text-xs text-muted">Hỗ trợ .json và .json.gz · tối đa 750 MB (tải theo phân đoạn</span><input className="sr-only" type="file" accept="application/json,application/gzip,.json,.json.gz,.gz" onChange={(event) => void chooseFile(event)} disabled={previewing || restoring} /></label>{fileName && !preview && !previewing ? <p className="mt-3 text-xs text-[#A34141]">File chưa vượt qua bước kiểm tra.</p> : null}</div></article>
    </section>

    <section className="lexora-card overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-line bg-[#F8F7FC] p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="flex items-start gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-[#EAE7FF] text-xl text-[#6550DB]">✉</span><div><h2 className="font-extrabold">Gửi sao lưu tự động qua email</h2><p className="mt-1 text-sm leading-6 text-muted">Mỗi ngày hệ thống nén bản sao lưu và gửi trong khung giờ bạn chọn.</p></div></div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-full border border-line bg-white px-4 text-sm font-bold"><input type="checkbox" checked={emailSchedule.enabled} onChange={(event) => setEmailSchedule((value) => ({ ...value, enabled: event.target.checked }))} className="h-4 w-4 accent-[#7865EE]" disabled={scheduleLoading} /><span>{emailSchedule.enabled ? "Đang bật" : "Đang tắt"}</span></label>
      </div>
      <div className="p-5 sm:p-6">
        {(!emailConfigured || !cronConfigured) ? <div className="mb-5 rounded-[14px] border border-[#F0DDA2] bg-[#FFF9E7] p-4 text-sm leading-6 text-[#72591A]"><b className="block text-[#56410E]">Chưa thể chạy tự động trên production</b>{!emailConfigured ? "Thiếu cấu hình SMTP. " : ""}{!cronConfigured ? "Thiếu biến môi trường CRON_SECRET. " : ""}Bạn vẫn có thể lưu cấu hình sau khi bổ sung các biến trên Vercel.</div> : null}
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
          <label className="block"><span className="mb-2 block text-xs font-bold text-muted">Email cố định nhận sao lưu</span><input type="email" value={emailSchedule.recipient} onChange={(event) => setEmailSchedule((value) => ({ ...value, recipient: event.target.value }))} placeholder="backup@vidu.com" className="h-12 w-full rounded-[12px] border border-line bg-white px-4 text-sm outline-none transition focus:border-[#7865EE] focus:ring-4 focus:ring-[#7865EE]/10" disabled={scheduleLoading} /></label>
          <div className="rounded-[13px] border border-line bg-[#FAF9FD] p-4 text-sm leading-6"><span className="block text-xs font-bold uppercase tracking-[0.12em] text-muted">Giờ gửi cố định</span><b className="mt-1 block text-base text-ink">00:00 mỗi ngày (ICT)</b><span className="mt-2 block text-xs leading-5 text-muted">Cron Vercel chạy 1 lần/ngày lúc 17:00 UTC để phù hợp giới hạn gói Hobby.</span></div>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center"><button type="button" onClick={() => void saveSchedule()} disabled={scheduleLoading || scheduleSaving || testingEmail} className="h-11 rounded-[11px] bg-gold px-5 text-sm font-bold text-white transition hover:bg-golddark disabled:cursor-wait disabled:opacity-50">{scheduleSaving ? "Đang lưu…" : "Lưu lịch tự động"}</button><button type="button" onClick={() => void sendTestEmail()} disabled={scheduleLoading || scheduleSaving || testingEmail || !emailConfigured} className="h-11 rounded-[11px] border border-line bg-white px-5 text-sm font-bold transition hover:border-[#CFC7FF] hover:text-gold disabled:cursor-wait disabled:opacity-50">{testingEmail ? "Đang tạo và gửi…" : "Gửi bản thử ngay"}</button><span className="text-xs leading-5 text-muted">Sao lưu được gửi lúc 00:00 ICT mỗi ngày qua một cron Vercel duy nhất (phù hợp giới hạn 2 cron/ngày của gói Hobby).</span></div>
        {emailSchedule.lastSentAt ? <p className="mt-4 text-xs text-[#267A52]">✓ Gửi thành công gần nhất: {new Date(emailSchedule.lastSentAt).toLocaleString("vi-VN")}</p> : null}
        {emailSchedule.lastError ? <p className="mt-2 text-xs text-[#A34141]">Lỗi gần nhất: {emailSchedule.lastError}</p> : null}
        <div className="mt-4 grid gap-2 rounded-[13px] border border-line bg-[#FAF9FD] p-3 text-xs sm:grid-cols-2">
          <div><span className="block text-muted">Vercel Cron gọi gần nhất</span><b className={emailSchedule.lastCronAt ? "mt-1 block text-ink" : "mt-1 block text-[#A34141]"}>{emailSchedule.lastCronAt ? new Date(emailSchedule.lastCronAt).toLocaleString("vi-VN") : "Chưa ghi nhận lần gọi nào"}</b></div>
          <div><span className="block text-muted">Lần thử gửi tự động gần nhất</span><b className="mt-1 block text-ink">{emailSchedule.lastAttemptAt ? `${new Date(emailSchedule.lastAttemptAt).toLocaleString("vi-VN")} · ${emailSchedule.lastAttemptStatus === "success" ? "thành công" : emailSchedule.lastAttemptStatus === "running" ? "đang xử lý" : "thất bại"}` : "Chưa đến khung giờ hoặc cron chưa chạy"}</b></div>
        </div>
        {emailSchedule.enabled && cronConfigured && !emailSchedule.lastCronAt ? <p className="mt-2 rounded-lg bg-[#FFF4D6] px-3 py-2 text-xs leading-5 text-[#72591A]">Lịch đã bật nhưng production chưa ghi nhận Vercel Cron. Sau lần triển khai này, kiểm tra mục Settings → Cron Jobs trên Vercel và bảo đảm Cron Jobs không bị Disable.</p> : null}
      </div>
    </section>

    {preview ? <section className="lexora-card p-5 sm:p-6"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#6550DB]">Bản xem trước · định dạng v{preview.version}</p><h2 className="mt-1 text-lg font-extrabold">{fileName}</h2><p className="mt-1 text-sm text-muted">Được tạo lúc {new Date(preview.createdAt).toLocaleString("vi-VN")}</p></div><span className={`w-fit rounded-full px-3 py-1.5 text-xs font-bold ${preview.integrity === "verified" ? "bg-[#E8F6EF] text-[#267A52]" : "bg-[#FFF4D6] text-[#72591A]"}`}>{preview.integrity === "verified" ? "✓ Toàn vẹn SHA-256" : "Bản v1 · chưa có checksum"}</span></div>{preview.integrity === "legacy" ? <div className="mt-4 rounded-[14px] border border-[#F0DDA2] bg-[#FFF9E7] p-4 text-sm leading-6 text-[#72591A]">Đây là bản sao lưu v1 cũ nên không thể xác minh file có bị thay đổi hay không. Chỉ tiếp tục nếu bạn tin tưởng nguồn file.</div> : null}<div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{BACKUP_COLLECTIONS.filter((name) => preview.counts[name] > 0).map((name) => <div key={name} className="flex items-center justify-between rounded-[12px] border border-line px-3 py-2.5 text-sm"><span className="text-muted">{LABELS[name]}</span><b>{preview.counts[name].toLocaleString("vi-VN")}</b></div>)}</div>{preview.unknownUsers.length ? <div className="mt-5 rounded-[14px] border border-[#D9D5EC] bg-[#F8F7FC] p-4 text-sm leading-6 text-main"><b className="block">{preview.unknownUsers.length} tài khoản sẽ được tạo lại ở trạng thái khóa mật khẩu</b>{preview.unknownUsers.slice(0, 8).join(", ")}{preview.unknownUsers.length > 8 ? "…" : ""}. Sau khi khôi phục, hãy tạo liên kết đặt lại mật khẩu trong mục Người dùng để họ đăng nhập lại.</div> : null}<div className="mt-6 rounded-[14px] border border-line bg-[#FAF9FD] p-4"><label className="text-sm font-bold" htmlFor="restore-confirmation">Nhập <span className="font-mono text-[#6550DB]">{CONFIRMATION}</span> để xác nhận</label><div className="mt-3 flex flex-col gap-3 sm:flex-row"><input id="restore-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value.toUpperCase())} placeholder={CONFIRMATION} autoComplete="off" className="h-12 min-w-0 flex-1 rounded-[12px] border border-line bg-white px-4 text-sm font-bold outline-none transition focus:border-[#7865EE] focus:ring-4 focus:ring-[#7865EE]/10" /><button type="button" onClick={() => void restoreBackup()} disabled={confirmation !== CONFIRMATION || restoring || downloading} className="h-12 rounded-[12px] bg-[#242337] px-5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-black disabled:cursor-not-allowed disabled:opacity-40">{restoring ? "Đang khôi phục…" : "Sao lưu rồi khôi phục"}</button></div><p className="mt-3 text-xs leading-5 text-muted">Không xóa hoặc ghi đè dữ liệu. Nếu có lỗi, toàn bộ thay đổi của lần khôi phục sẽ được hoàn tác trong cùng transaction.</p></div></section> : null}

    {report ? <section className="lexora-card border-[#BFE3D2] p-5 sm:p-6"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E8F6EF] font-extrabold text-[#267A52]">✓</span><div><h2 className="font-extrabold">Khôi phục hoàn tất</h2><p className="text-sm text-muted">Đã gộp dữ liệu mới và giữ nguyên các bản ghi trùng.</p></div></div><div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{BACKUP_COLLECTIONS.filter((name) => report.added[name] + report.skipped[name] > 0).map((name) => <div key={name} className="rounded-[12px] border border-line p-3 text-sm"><b className="block">{LABELS[name]}</b><span className="mt-1 block text-[#267A52]">Thêm {report.added[name]}</span><span className="text-muted">Giữ nguyên/bỏ qua {report.skipped[name]}</span></div>)}</div>{report.warnings.length ? <ul className="mt-4 space-y-1 text-sm text-[#72591A]">{report.warnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul> : null}</section> : null}

    <section className="rounded-[16px] border border-[#F0DDA2] bg-[#FFF9E7] p-5 text-sm leading-6 text-[#72591A]"><b className="block text-[#56410E]">Lưu ý bảo mật</b>File sao lưu chứa thông tin cá nhân và bài nộp của học sinh. Hãy lưu trong thư mục an toàn. Mật khẩu và token đặt lại mật khẩu không bao giờ được đưa vào file.</section>
  </div>;
}
