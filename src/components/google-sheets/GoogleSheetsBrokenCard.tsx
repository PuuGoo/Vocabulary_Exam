"use client";
import { Connection, primary, secondary } from "./types";

/**
 * Broken states get their own panel so the recovery path is obvious.
 * Data is safe: recovery reuses the existing spreadsheet, never a new one.
 */
export default function GoogleSheetsBrokenCard({ connection, canManage, busy, canCreate, onRecover, onCreateNew }: { connection: Connection; canManage: boolean; busy: boolean; canCreate: boolean; onRecover: () => void; onCreateNew: () => void }) {
  const isError = connection.status === "error";
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 sm:p-5" role="alert">
      <p className="text-sm font-semibold text-red-700">{isError ? "Google Sheet gặp lỗi kết nối" : "Google Sheet đã ngắt kết nối"}</p>
      <p className="mt-1 text-xs leading-5 text-red-600">{connection.externalState === "missing" ? "Google Sheet không còn hoặc đã được đưa vào Thùng rác. Từ vựng và dữ liệu học tập trong Lexora vẫn được giữ nguyên." : "Từ vựng và dữ liệu học tập vẫn được giữ nguyên. Kiểm tra quyền truy cập Google trước khi khôi phục kết nối."}</p>
      {connection.lastError ? <p className="mt-2 break-words rounded-xl bg-white/70 px-3 py-2 text-xs text-red-700">Lỗi gần nhất: {connection.lastError}</p> : null}
      {canManage ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={primary} disabled={busy} onClick={onRecover} autoFocus>
            {busy ? "Đang khôi phục…" : "Khôi phục kết nối"}
          </button>
          <a className={secondary} href={connection.spreadsheetUrl} target="_blank" rel="noopener noreferrer">
            Mở Google Sheet ↗
          </a>
          {canCreate ? (
            <button type="button" className={secondary} disabled={busy} onClick={onCreateNew}>
              Tạo Google Sheet mới
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
