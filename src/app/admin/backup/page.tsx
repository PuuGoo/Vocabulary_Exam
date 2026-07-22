"use client";

import { useEffect, useState } from "react";
import { toast } from "@/components/Toast";

const STORAGE_KEY = "lexora_last_backup_at";

export default function BackupPage() {
  const [downloading, setDownloading] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);

  useEffect(() => setLastBackupAt(localStorage.getItem(STORAGE_KEY)), []);

  async function downloadBackup() {
    if (downloading) return;
    setDownloading(true);
    try {
      const response = await fetch("/api/admin/backup", { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Không thể tạo bản sao lưu.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] || "lexora-backup.json";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      const completedAt = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, completedAt);
      setLastBackupAt(completedAt);
      toast("Đã tải bản sao lưu dữ liệu.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Không thể tạo bản sao lưu.");
    } finally {
      setDownloading(false);
    }
  }

  return <div className="lexora-page-enter mx-auto max-w-4xl space-y-6">
    <section><p className="mb-2 text-sm font-semibold text-gold">Quản trị / An toàn dữ liệu</p><h1 className="text-[clamp(1.8rem,4vw,2.5rem)] font-extrabold tracking-[-0.045em]">Sao lưu dữ liệu</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Tải xuống một bản sao đầy đủ dữ liệu học tập để lưu trữ ngoại tuyến hoặc dùng khi cần khôi phục.</p></section>
    <section className="lexora-card overflow-hidden"><div className="border-b border-line bg-[#F8F7FC] p-5 sm:p-6"><div className="flex items-start gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-[#EAE7FF] text-xl text-[#6550DB]">↓</span><div><h2 className="text-base font-extrabold">Tạo bản sao lưu mới</h2><p className="mt-1 text-sm leading-6 text-muted">Bao gồm lớp học, bộ từ, tiến độ, bài làm, ghi chú và file học sinh đã nộp.</p></div></div></div><div className="p-5 sm:p-6"><dl className="grid gap-3 text-sm sm:grid-cols-3"><div className="rounded-[13px] border border-line p-4"><dt className="text-xs font-semibold text-muted">Định dạng</dt><dd className="mt-1 font-bold">Lexora JSON v1</dd></div><div className="rounded-[13px] border border-line p-4"><dt className="text-xs font-semibold text-muted">Bảo mật</dt><dd className="mt-1 font-bold">Không chứa mật khẩu</dd></div><div className="rounded-[13px] border border-line p-4"><dt className="text-xs font-semibold text-muted">Lần tải gần nhất</dt><dd className="mt-1 font-bold">{lastBackupAt ? new Date(lastBackupAt).toLocaleString("vi-VN") : "Chưa có"}</dd></div></dl><button type="button" onClick={() => void downloadBackup()} disabled={downloading} className="mt-6 inline-flex h-12 items-center justify-center rounded-[12px] bg-gold px-5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-golddark disabled:cursor-wait disabled:opacity-60">{downloading ? "Đang đóng gói dữ liệu…" : "Tải bản sao lưu"}</button></div></section>
    <section className="rounded-[16px] border border-[#F0DDA2] bg-[#FFF9E7] p-5 text-sm leading-6 text-[#72591A]"><b className="block text-[#56410E]">Lưu ý bảo mật</b>File sao lưu vẫn chứa thông tin cá nhân và bài nộp của học sinh. Hãy lưu trong thư mục an toàn, không gửi qua kênh công khai. Mật khẩu và token đặt lại mật khẩu không được đưa vào file.</section>
  </div>;
}
