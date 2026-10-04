"use client";
import { useEffect, useRef, useState } from "react";
import { Connection, SyncRun, formatDate, primary, secondary, statusView } from "./types";
import GoogleSheetsStatusCard from "./GoogleSheetsStatusCard";
import GoogleSheetsSyncHealth from "./GoogleSheetsSyncHealth";
import GoogleSheetsSyncStats from "./GoogleSheetsSyncStats";

type DetailsProps = {
  connection: Connection;
  latestRun: SyncRun | null;
  feedback: string;
  invalid: Array<{ rowNumber: number; message: string }>;
  busy: boolean;
  onHistory: () => void;
  onSettings: () => void;
  onChanges: () => void;
  onRecover: () => void;
  onPause: () => void;
  onDisconnect: () => void;
  canManage: boolean;
};

/**
 * The connected workspace. The dominant action is opening the spreadsheet;
 * manual sync and settings stay secondary.
 */
export default function GoogleSheetsDetails({ connection, latestRun, feedback, invalid, busy, onHistory, onSettings, onChanges, onRecover, onPause, onDisconnect, canManage }: DetailsProps) {
  const view = statusView(connection);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // The ⋮ menu behaves like a native menu: Escape, Tab or an outside click closes it.
  useEffect(() => {
    if (!menuOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" || event.key === "Tab") setMenuOpen(false);
    }
    function onPointer(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [menuOpen]);
  return (
    <div className="space-y-3">
      <GoogleSheetsStatusCard status={view} feedback={latestRun?.status === "partial" ? "⚠ Đồng bộ một phần — cần xử lý" : feedback} />
      <div className="min-w-0 rounded-2xl border border-line bg-white p-4 sm:p-5">
        {/* Horizontal on desktop, stacked on mobile — never a horizontal scrollbar. */}
        <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 gap-3">
            <span aria-hidden="true" className="flex h-12 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-700 text-white">
              <svg className="h-7 w-6" viewBox="0 0 32 40" fill="none">
                <path d="M4 0h16l12 12v24a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4Z" fill="currentColor" />
                <path d="M20 0v12h12" fill="#a7f3d0" />
                <path d="M7 19h18v14H7zm0 7h18M16 19v14" stroke="white" strokeWidth="2" />
              </svg>
            </span>
            <div className="min-w-0">
              <h4 className="break-words font-serif text-base font-semibold leading-tight sm:text-lg">{connection.spreadsheetName}</h4>
              <p className="mt-1 break-words text-xs text-muted">Tab: {connection.sheetTitle}</p>
              <p className="mt-2 text-sm">
                {connection.wordCount.toLocaleString("vi-VN")} từ · {connection.columnCount} cột
              </p>
            </div>
          </div>
          <div className="min-w-0 lg:max-w-[50%]">
            <p className="text-xs text-muted">Đồng bộ lần cuối</p>
            <p className="mt-1 text-sm font-medium tabular-nums">{formatDate(connection.lastSuccessfulSyncAt)}</p>
            <div className="mt-3">
              <GoogleSheetsSyncStats run={latestRun} invalid={invalid} />
              {latestRun ? (
                <button type="button" className="mt-2 min-h-9 text-xs font-semibold text-emerald-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700" onClick={onChanges}>
                  Xem thay đổi
                </button>
              ) : null}
            </div>
          </div>
        </div>
        <GoogleSheetsSyncHealth connection={connection} canManage={canManage} busy={busy} onRecover={onRecover} partial={latestRun?.status === "partial"} />
        <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
          <a className={`${primary} text-center`} href={connection.spreadsheetUrl} target="_blank" rel="noopener noreferrer">
            Mở Google Sheet ↗
          </a>
          <button type="button" className={secondary} disabled={busy} onClick={onHistory} aria-haspopup="dialog">
            Lịch sử
          </button>
          <button type="button" className={secondary} disabled={busy} onClick={onSettings} aria-haspopup="dialog">
            Cài đặt
          </button>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              className={secondary + " px-3"}
              disabled={busy}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Thêm tác vụ"
              onClick={() => setMenuOpen((open) => !open)}
            >
              ⋮
            </button>
            {menuOpen ? (
              <div role="menu" className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-line bg-white p-1 shadow-lg">
                <button
                  type="button"
                  role="menuitem"
                  className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
                  onClick={() => { setMenuOpen(false); onPause(); }}
                >
                  {connection.enabled ? "Tạm dừng đồng bộ" : "Tiếp tục đồng bộ"}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400"
                  onClick={() => { setMenuOpen(false); onDisconnect(); }}
                >
                  Ngắt kết nối
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
