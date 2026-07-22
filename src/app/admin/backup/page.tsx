"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { toast } from "@/components/Toast";
import { BACKUP_COLLECTIONS, BackupCollection } from "@/lib/backup";

const STORAGE_KEY = "lexora_last_backup_at";
const CONFIRMATION = "KHOI PHUC";
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const LABELS: Record<BackupCollection, string> = {
  users: "Tài khoản", classes: "Lớp học", classMembers: "Thành viên lớp", vocabSets: "Bộ từ",
  words: "Từ vựng", attempts: "Lượt luyện tập", assignments: "Bài tập", assignmentExtensions: "Gia hạn",
  assignmentSubmissions: "Bài nộp", teachBackNotes: "Ghi chú giảng lại", mistakes: "Từ hay sai",
  wordProgress: "Tiến độ từ", wordBookmarks: "Từ đã lưu", studySessions: "Phiên học",
  learningGoals: "Mục tiêu", dailyActivities: "Hoạt động ngày",
};

type Preview = { createdAt: string; counts: Record<BackupCollection, number>; unknownUsers: string[]; strategy: string };
type RestoreReport = { added: Record<BackupCollection, number>; skipped: Record<BackupCollection, number>; warnings: string[] };

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
  const [restoring, setRestoring] = useState(false);
  const [report, setReport] = useState<RestoreReport | null>(null);

  useEffect(() => setLastBackupAt(localStorage.getItem(STORAGE_KEY)), []);

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

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setBackup(null); setPreview(null); setReport(null); setConfirmation(""); setFileName(file?.name || "");
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) { toast("File lớn hơn 20 MB. Hãy kiểm tra lại file sao lưu."); event.target.value = ""; return; }
    setPreviewing(true);
    try {
      const parsed = JSON.parse(await file.text());
      const response = await fetch("/api/admin/backup/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "preview", backup: parsed }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Không thể đọc file sao lưu.");
      setBackup(parsed); setPreview(payload); toast("File hợp lệ. Hãy kiểm tra bản xem trước.");
    } catch (error) { setFileName(""); toast(error instanceof Error ? error.message : "File JSON không hợp lệ."); }
    finally { setPreviewing(false); event.target.value = ""; }
  }

  async function restoreBackup() {
    if (!backup || !preview || confirmation !== CONFIRMATION || restoring) return;
    setRestoring(true); setReport(null);
    try {
      const backedUp = await downloadBackup(false);
      if (!backedUp) throw new Error("Đã dừng khôi phục vì chưa thể sao lưu dữ liệu hiện tại.");
      const response = await fetch("/api/admin/backup/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore", confirmation, backup }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Không thể khôi phục dữ liệu.");
      setReport(payload.report); setConfirmation(""); toast("Khôi phục hoàn tất. Dữ liệu hiện có vẫn được giữ nguyên.");
    } catch (error) { toast(error instanceof Error ? error.message : "Không thể khôi phục dữ liệu."); }
    finally { setRestoring(false); }
  }

  return <div className="lexora-page-enter mx-auto max-w-5xl space-y-6">
    <section><p className="mb-2 text-sm font-semibold text-gold">Quản trị / An toàn dữ liệu</p><h1 className="text-[clamp(1.8rem,4vw,2.5rem)] font-extrabold tracking-[-0.045em]">Sao lưu và khôi phục</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted">Giữ một bản dữ liệu ngoại tuyến và gộp lại an toàn khi cần. Hệ thống không ghi đè tài khoản, mật khẩu hay dữ liệu đang có.</p></section>

    <section className="grid gap-5 lg:grid-cols-2">
      <article className="lexora-card overflow-hidden"><div className="border-b border-line bg-[#F8F7FC] p-5 sm:p-6"><div className="flex items-start gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-[#EAE7FF] text-xl text-[#6550DB]">↓</span><div><h2 className="font-extrabold">Tạo bản sao lưu mới</h2><p className="mt-1 text-sm leading-6 text-muted">Bao gồm lớp, bộ từ, tiến độ, bài làm, ghi chú và file học sinh đã nộp.</p></div></div></div><div className="p-5 sm:p-6"><dl className="grid gap-3 text-sm sm:grid-cols-2"><div className="rounded-[13px] border border-line p-4"><dt className="text-xs font-semibold text-muted">Định dạng</dt><dd className="mt-1 font-bold">Lexora JSON v1</dd></div><div className="rounded-[13px] border border-line p-4"><dt className="text-xs font-semibold text-muted">Lần tải gần nhất</dt><dd className="mt-1 font-bold">{lastBackupAt ? new Date(lastBackupAt).toLocaleString("vi-VN") : "Chưa có"}</dd></div></dl><button type="button" onClick={() => void downloadBackup()} disabled={downloading || restoring} className="mt-6 inline-flex h-12 items-center justify-center rounded-[12px] bg-gold px-5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-golddark disabled:cursor-wait disabled:opacity-60">{downloading ? "Đang đóng gói dữ liệu…" : "Tải bản sao lưu"}</button></div></article>

      <article className="lexora-card overflow-hidden"><div className="border-b border-line bg-[#F8F7FC] p-5 sm:p-6"><div className="flex items-start gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-[#E8F6EF] text-xl text-[#267A52]">↥</span><div><h2 className="font-extrabold">Khôi phục từ file JSON</h2><p className="mt-1 text-sm leading-6 text-muted">Kiểm tra trước, chỉ thêm dữ liệu còn thiếu và tự sao lưu trạng thái hiện tại.</p></div></div></div><div className="p-5 sm:p-6"><label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-[14px] border-2 border-dashed border-[#D9D5EC] bg-[#FAF9FD] px-4 text-center transition hover:border-[#8A79E7] hover:bg-[#F7F5FF]"><span className="text-sm font-bold text-main">{previewing ? "Đang kiểm tra file…" : fileName || "Chọn file sao lưu .json"}</span><span className="mt-1 text-xs text-muted">Tối đa 20 MB</span><input className="sr-only" type="file" accept="application/json,.json" onChange={(event) => void chooseFile(event)} disabled={previewing || restoring} /></label>{fileName && !preview && !previewing ? <p className="mt-3 text-xs text-[#A34141]">File chưa vượt qua bước kiểm tra.</p> : null}</div></article>
    </section>

    {preview ? <section className="lexora-card p-5 sm:p-6"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#6550DB]">Bản xem trước</p><h2 className="mt-1 text-lg font-extrabold">{fileName}</h2><p className="mt-1 text-sm text-muted">Được tạo lúc {new Date(preview.createdAt).toLocaleString("vi-VN")}</p></div><span className="w-fit rounded-full bg-[#E8F6EF] px-3 py-1.5 text-xs font-bold text-[#267A52]">File hợp lệ</span></div><div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{BACKUP_COLLECTIONS.filter((name) => preview.counts[name] > 0).map((name) => <div key={name} className="flex items-center justify-between rounded-[12px] border border-line px-3 py-2.5 text-sm"><span className="text-muted">{LABELS[name]}</span><b>{preview.counts[name].toLocaleString("vi-VN")}</b></div>)}</div>{preview.unknownUsers.length ? <div className="mt-5 rounded-[14px] border border-[#F0DDA2] bg-[#FFF9E7] p-4 text-sm leading-6 text-[#72591A]"><b className="block text-[#56410E]">{preview.unknownUsers.length} tài khoản chưa tồn tại sẽ được bỏ qua</b>{preview.unknownUsers.slice(0, 8).join(", ")}{preview.unknownUsers.length > 8 ? "…" : ""}. File không có mật khẩu nên hệ thống không thể tạo các tài khoản này một cách an toàn.</div> : null}<div className="mt-6 rounded-[14px] border border-line bg-[#FAF9FD] p-4"><label className="text-sm font-bold" htmlFor="restore-confirmation">Nhập <span className="font-mono text-[#6550DB]">{CONFIRMATION}</span> để xác nhận</label><div className="mt-3 flex flex-col gap-3 sm:flex-row"><input id="restore-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value.toUpperCase())} placeholder={CONFIRMATION} autoComplete="off" className="h-12 min-w-0 flex-1 rounded-[12px] border border-line bg-white px-4 text-sm font-bold outline-none transition focus:border-[#7865EE] focus:ring-4 focus:ring-[#7865EE]/10" /><button type="button" onClick={() => void restoreBackup()} disabled={confirmation !== CONFIRMATION || restoring || downloading} className="h-12 rounded-[12px] bg-[#242337] px-5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-black disabled:cursor-not-allowed disabled:opacity-40">{restoring ? "Đang khôi phục…" : "Sao lưu rồi khôi phục"}</button></div><p className="mt-3 text-xs leading-5 text-muted">Không xóa hoặc ghi đè dữ liệu. Nếu có lỗi, toàn bộ thay đổi của lần khôi phục sẽ được hoàn tác.</p></div></section> : null}

    {report ? <section className="lexora-card border-[#BFE3D2] p-5 sm:p-6"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E8F6EF] font-extrabold text-[#267A52]">✓</span><div><h2 className="font-extrabold">Khôi phục hoàn tất</h2><p className="text-sm text-muted">Đã gộp dữ liệu mới và giữ nguyên các bản ghi trùng.</p></div></div><div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{BACKUP_COLLECTIONS.filter((name) => report.added[name] + report.skipped[name] > 0).map((name) => <div key={name} className="rounded-[12px] border border-line p-3 text-sm"><b className="block">{LABELS[name]}</b><span className="mt-1 block text-[#267A52]">Thêm {report.added[name]}</span><span className="text-muted">Giữ nguyên/bỏ qua {report.skipped[name]}</span></div>)}</div>{report.warnings.length ? <ul className="mt-4 space-y-1 text-sm text-[#72591A]">{report.warnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul> : null}</section> : null}

    <section className="rounded-[16px] border border-[#F0DDA2] bg-[#FFF9E7] p-5 text-sm leading-6 text-[#72591A]"><b className="block text-[#56410E]">Lưu ý bảo mật</b>File sao lưu chứa thông tin cá nhân và bài nộp của học sinh. Hãy lưu trong thư mục an toàn. Mật khẩu và token đặt lại mật khẩu không bao giờ được đưa vào file.</section>
  </div>;
}
