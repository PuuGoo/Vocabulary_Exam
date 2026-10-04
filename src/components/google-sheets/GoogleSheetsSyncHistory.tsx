"use client";
import Modal from "@/components/Modal";
import { SyncRun, formatDate } from "./types";
import GoogleSheetsSyncStats from "./GoogleSheetsSyncStats";
export function runStatus(value: string) {
  if (value === "partial") return "Đồng bộ một phần — cần xử lý";
  if (value === "success") return "Đã đồng bộ";
  if (value === "running") return "Đang đồng bộ…";
  return "Đồng bộ đang gặp vấn đề";
}
export function triggerLabel(value: string) {
  const labels: Record<string, string> = {
    initial: "Kết nối ban đầu",
    manual: "Thủ công",
    webhook: "Thay đổi từ Google Sheet",
    reconcile: "Tự động kiểm tra",
    recovery: "Khôi phục kết nối",
    recover: "Khôi phục kết nối",
    cron: "Tự động kiểm tra",
  };
  return labels[value] ?? "Tự động";
}
export default function GoogleSheetsSyncHistory({ runs, onClose, onSelect }: { runs: SyncRun[]; onClose: () => void; onSelect: (run: SyncRun) => void }) {
  return (
    <Modal title="Lịch sử đồng bộ" onClose={onClose}>
      <p className="mb-4 text-xs text-muted">Các lần đồng bộ gần đây. Mỗi lần chạy lưu số từ đã tạo, cập nhật, giữ nguyên, lưu trữ và số dòng không hợp lệ. Chọn một lần để xem chi tiết.</p>
      {runs.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Chưa có lần đồng bộ nào.</p>
      ) : (
        <ul className="space-y-3">
          {runs.map((run) => (
            <li key={run.id}>
              <button type="button" className="w-full rounded-xl border border-line p-4 text-left hover:border-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700" onClick={() => onSelect(run)}>
                <div className="mb-2 flex flex-wrap justify-between gap-2 text-sm">
                  <b>{formatDate(run.finishedAt || run.startedAt)}</b>
                  <span className={run.status === "success" ? "text-emerald-700" : "text-amber-700"}>{runStatus(run.status)}</span>
                </div>
                <p className="mb-2 text-xs text-muted">{triggerLabel(run.triggerType)}</p>
                <GoogleSheetsSyncStats run={run} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
