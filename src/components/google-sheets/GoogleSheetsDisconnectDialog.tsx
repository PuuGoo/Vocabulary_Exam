"use client";
import Modal from "@/components/Modal";
import { danger, secondary } from "./types";

/** Disconnect stops automatic sync; it never deletes anything. */
export default function GoogleSheetsDisconnectDialog({ busy, onClose, onConfirm }: { busy: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <Modal title="Ngắt kết nối Google Sheet?" onClose={onClose}>
      <p className="text-sm leading-6 text-muted">Ngắt kết nối chỉ dừng đồng bộ tự động. Không có gì bị xóa:</p>
      <ul className="mt-3 space-y-1.5 text-sm text-muted">
        <li>• Vocabulary trong Lexora.</li>
        <li>• Tiến độ học tập.</li>
        <li>• Danh sách từ sai.</li>
        <li>• Lịch sử học tập.</li>
        <li>• Google Sheet của bạn.</li>
      </ul>
      <p className="mt-3 text-sm leading-6 text-muted">Sau khi ngắt kết nối, Lexora sẽ không tự động nhận thay đổi từ Google Sheet nữa.</p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" className={secondary} disabled={busy} onClick={onClose} autoFocus>
          Hủy
        </button>
        <button type="button" className={danger} disabled={busy} onClick={onConfirm}>
          {busy ? "Đang ngắt kết nối…" : "Ngắt kết nối"}
        </button>
      </div>
    </Modal>
  );
}