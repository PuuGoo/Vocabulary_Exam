"use client";
import Modal from "@/components/Modal";
import { primary, secondary } from "./types";
export default function GoogleSheetsCreateSuccess({ count, url, onClose }: { count: number; url: string; onClose: () => void }) {
  return (
    <Modal title="✓ Google Sheet đã được tạo" onClose={onClose}>
      <p className="text-sm">{count.toLocaleString("vi-VN")} từ đã được đưa vào Sheet.</p>
      <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">Tự động đồng bộ: Đã bật</p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <a className={primary} href={url} target="_blank" rel="noopener noreferrer" autoFocus>
          Mở Google Sheet ↗
        </a>
        <button type="button" className={secondary} onClick={onClose}>
          Xong
        </button>
      </div>
    </Modal>
  );
}