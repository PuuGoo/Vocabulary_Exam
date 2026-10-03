"use client";
import Modal from "@/components/Modal";
import { primary, secondary } from "./types";

/** Pausing never happens by surprise: the admin must confirm it first. */
export default function GoogleSheetsPauseDialog({ busy, resuming, onClose, onConfirm }: { busy: boolean; resuming: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <Modal title={resuming ? "Tiếp tục đồng bộ?" : "Tạm dừng đồng bộ?"} onClose={onClose}>
      {resuming ? (
        <>
          <p className="text-sm leading-6 text-muted">Lexora sẽ tiếp tục tự động nhận thay đổi từ Google Sheet. Không cần bạn làm gì thêm.</p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" className={secondary} disabled={busy} onClick={onClose}>
              Hủy
            </button>
            <button type="button" className={primary} disabled={busy} onClick={onConfirm} autoFocus>
              {busy ? "Đang tiếp tục…" : "Tiếp tục đồng bộ"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm leading-6 text-muted">Khi tạm dừng, Lexora tạm thời không nhận thay đổi mới từ Google Sheet. Dữ liệu của bạn vẫn được giữ nguyên:</p>
          <ul className="mt-3 space-y-1.5 text-sm text-muted">
            <li>• Google Sheet không bị xóa.</li>
            <li>• Vocabulary không bị xóa.</li>
            <li>• Tiến độ học tập không bị xóa.</li>
            <li>• Lexora tạm thời không nhận thay đổi.</li>
          </ul>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" className={secondary} disabled={busy} onClick={onClose}>
              Hủy
            </button>
            <button type="button" className={primary} disabled={busy} onClick={onConfirm} autoFocus>
              {busy ? "Đang tạm dừng…" : "Tạm dừng"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}