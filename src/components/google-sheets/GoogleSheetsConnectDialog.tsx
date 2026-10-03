"use client";
import Modal from "@/components/Modal";
import { primary, secondary } from "./types";
export type ConnectPreview = { tabs: Array<{ sheetId: number; title: string }>; sheetTitle: string; templateType: string; totalRows: number; previewRows: Array<{ rowNumber: number; values: Record<string, unknown> }> };
export default function GoogleSheetsConnectDialog({ url, tab, preview, busy, error, onUrl, onTab, onVerify, onConnect, onClose }: { url: string; tab: string; preview: ConnectPreview | null; busy: boolean; error: string; onUrl: (value: string) => void; onTab: (value: string) => void; onVerify: () => void; onConnect: () => void; onClose: () => void }) {
  const verified = !!preview && preview.sheetTitle === tab;
  return (
    <Modal title="Kết nối Sheet có sẵn" onClose={onClose}>
      <p className="mb-4 text-xs text-muted">Dán URL → kiểm tra quyền → chọn tab → xem trước → kết nối.</p>
      <label className="mb-2 block text-sm font-semibold" htmlFor="gs-connect-url">
        Link Google Sheet
      </label>
      <input id="gs-connect-url" type="url" className="w-full rounded-xl border border-line p-3 text-sm" placeholder="https://docs.google.com/spreadsheets/d/..." value={url} disabled={busy} onChange={(event) => onUrl(event.target.value)} />
      {preview ? (
        <>
          <label className="mb-2 mt-4 block text-sm font-semibold" htmlFor="gs-connect-tab">
            Chọn tab
          </label>
          <select id="gs-connect-tab" className="w-full rounded-xl border border-line p-3 text-sm" disabled={busy} value={tab} onChange={(event) => onTab(event.target.value)}>
            {preview.tabs.map((item) => (
              <option key={item.sheetId} value={item.title}>
                {item.title}
              </option>
            ))}
          </select>
          {verified ? (
            <div className="mt-4 rounded-xl bg-gray-50 p-4">
              <p className="text-sm font-semibold">Xem trước: {preview.totalRows} dòng</p>
              <p className="mt-1 text-xs text-muted">Lexora sẽ đồng bộ ban đầu và bật tự động đồng bộ.</p>
              <ul className="mt-3 space-y-2 text-xs">
                {preview.previewRows.map((row) => (
                  <li key={row.rowNumber} className="break-words">
                    Dòng {row.rowNumber}: {String(row.values.term || row.values.v1 || Object.values(row.values)[0] || "—")}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted">Kiểm tra tab đã chọn để xem trước.</p>
          )}
        </>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 break-words rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" className={secondary} disabled={busy} onClick={onClose}>
          Hủy
        </button>
        {verified ? (
          <button type="button" className={primary} disabled={busy} onClick={onConnect}>
            {busy ? "Đang kết nối…" : "Kết nối & bật tự động đồng bộ"}
          </button>
        ) : (
          <button type="button" className={primary} disabled={busy || !url.trim()} onClick={onVerify}>
            {busy ? "Đang kiểm tra…" : "Kiểm tra quyền & xem trước"}
          </button>
        )}
      </div>
    </Modal>
  );
}