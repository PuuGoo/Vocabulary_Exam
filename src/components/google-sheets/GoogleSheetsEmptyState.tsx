"use client";
import { primary, secondary } from "./types";

/**
 * The set has no Google Sheet. Creating is the dominant action; connecting an
 * existing spreadsheet is the secondary one.
 */
export default function GoogleSheetsEmptyState({ canManage, busy, resume, onCreate, onConnect }: { canManage: boolean; busy: boolean; resume: boolean; onCreate: () => void; onConnect: () => void }) {
  return (
    <div className="rounded-2xl border border-line bg-[#FBFAFE] p-5 sm:p-6">
      <h4 className="font-serif text-base font-semibold">Google Sheets</h4>
      <p className="mt-1 text-sm leading-6 text-muted">Quản lý vocabulary trực tiếp bằng Google Sheets.</p>
      <p className="mt-2 text-xs leading-5 text-muted">Lexora tạo Sheet theo template của bộ từ và tự động đồng bộ về PostgreSQL. Bạn chỉ cần chỉnh sửa trong Google Sheets.</p>
      {canManage ? (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" className={primary} disabled={busy} onClick={onCreate} aria-busy={busy}>
            {busy ? "Đang chuẩn bị…" : resume ? "Tiếp tục tạo Google Sheet" : "＋ Tạo Google Sheet"}
          </button>
          <button type="button" className={`${secondary} text-muted`} disabled={busy} onClick={onConnect}>
            Kết nối Sheet có sẵn
          </button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted">Bạn không có quyền quản lý Google Sheets cho bộ từ này.</p>
      )}
    </div>
  );
}