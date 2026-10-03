"use client";
import Modal from "@/components/Modal";
import { Connection, primary, secondary } from "./types";

export default function GoogleSheetsRecoveryDialog({ connection, busy, result, canCreate, onClose, onRecover, onCreate }: { connection: Connection; busy: boolean; result: string; canCreate: boolean; onClose: () => void; onRecover: () => void; onCreate: () => void }) {
  return (
    <Modal title="Khôi phục kết nối" onClose={onClose}>
      <p className="font-semibold text-amber-800">⚠ Đồng bộ đang gặp vấn đề</p>
      <p className="mt-2 text-sm leading-6 text-muted">Google Sheet vẫn còn và dữ liệu của bạn không bị mất. Nếu Sheet đã bị xóa hoặc quyền truy cập bị thu hồi, Lexora sẽ báo để bạn xử lý.</p>
      <div role="status" aria-live="polite" className="mt-4 rounded-xl bg-gray-50 p-4">
        <p className="text-sm font-semibold">{busy ? "Đang kiểm tra và khôi phục…" : result || "Sẵn sàng khôi phục"}</p>
        <ol className="mt-2 space-y-2 text-xs text-muted">
          <li>1. Kiểm tra Sheet</li>
          <li>2. Kiểm tra quyền</li>
          <li>3. Khôi phục watch</li>
          <li>4. Đồng bộ lại</li>
        </ol>
        <p className="mt-3 text-xs text-muted">Các bước được máy chủ thực hiện liên tiếp; kết quả hiển thị khi hoàn tất.</p>
      </div>
      <details className="mt-4 text-xs">
        <summary className="cursor-pointer py-2">Chi tiết</summary>
        <p className="break-words text-muted">{connection.lastError || "Chưa có thông tin kỹ thuật bổ sung."}</p>
      </details>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className={primary} disabled={busy} onClick={onRecover} autoFocus>
          {busy ? "Đang khôi phục…" : "Khôi phục kết nối"}
        </button>
        <a className={secondary} href={connection.spreadsheetUrl} target="_blank" rel="noopener noreferrer">
          Mở Google Sheet ↗
        </a>
        {canCreate ? (
          <button type="button" className={secondary} disabled={busy} onClick={onCreate}>
            Tạo Sheet mới
          </button>
        ) : null}
      </div>
    </Modal>
  );
}