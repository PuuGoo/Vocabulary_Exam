"use client";
import { useState } from "react";
import Modal from "@/components/Modal";
import { Connection, primary, secondary } from "./types";

export default function GoogleSheetsRepairDialog({ connection, onClose, onRepaired }: { connection: Connection; onClose: () => void; onRepaired: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  async function repair() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/google-sheets/connections/${connection.id}/repair`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spreadsheetId: connection.spreadsheetId, confirm: true }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không thể sửa Sheet.");
      setDone(true);
      setMessage(`Đã gán ${result.idsAssigned} ID, sửa ${result.sttRepaired} công thức STT và cập nhật kênh thông báo. Đồng bộ tiếp theo sẽ kiểm tra ánh xạ.`);
      await onRepaired();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể kết nối."); }
    finally { setBusy(false); }
  }
  return <Modal title="Sửa hệ thống Sheet?" onClose={() => { if (!busy) onClose(); }}>
    <p className="font-semibold">{connection.spreadsheetName}</p>
    <p className="mt-3 text-sm">Hãy tạm ngừng chỉnh sửa Sheet trong lúc sửa. Lexora chỉ gán ID còn thiếu, bổ sung công thức STT và sửa kênh thông báo. Không thay thế từ vựng, công thức AI hay văn bản bạn nhập.</p>
    <p className="mt-2 text-sm">Nếu cột hoặc ID không rõ ràng, thao tác sẽ dừng để bạn kiểm tra thủ công.</p>
    {message && <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm">{message}</p>}
    <div className="mt-4 flex gap-2"><button type="button" className={secondary} disabled={busy} onClick={onClose}>{done ? "Đóng" : "Hủy"}</button>{!done && <button type="button" className={primary} disabled={busy} onClick={() => void repair()}>{busy ? "Đang sửa…" : "Xác nhận sửa hệ thống"}</button>}</div>
  </Modal>;
}
