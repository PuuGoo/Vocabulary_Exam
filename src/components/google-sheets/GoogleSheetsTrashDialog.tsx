"use client";
import { useState } from "react";
import Modal from "@/components/Modal";
import { Connection, danger, secondary } from "./types";

export default function GoogleSheetsTrashDialog({ connection, onClose, onTrashed }: { connection: Connection; onClose: () => void; onTrashed: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function trash() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/google-sheets/connections/${connection.id}/trash`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spreadsheetId: connection.spreadsheetId, confirm: true }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không thể đưa Sheet vào Thùng rác.");
      await onTrashed();
      onClose();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Không thể kết nối."); }
    finally { setBusy(false); }
  }
  return <Modal title="Đưa Google Sheet vào Thùng rác?" onClose={() => { if (!busy) onClose(); }}>
    <p className="font-semibold">{connection.spreadsheetName}</p>
    <p className="mt-3 text-sm">Google Sheet sẽ được chuyển vào Thùng rác trong Drive và tự động đồng bộ sẽ dừng. Từ vựng, tiến độ học, lỗi sai và lịch ôn trong Lexora vẫn được giữ nguyên.</p>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    <div className="mt-5 flex flex-wrap gap-2"><button type="button" className={secondary} disabled={busy} onClick={onClose}>Hủy</button><button type="button" className={danger} disabled={busy || !connection.managedByLexora} onClick={() => void trash()}>{busy ? "Đang xử lý…" : "Đưa vào Thùng rác"}</button></div>
  </Modal>;
}
