"use client";
import { useState } from "react";
import Modal from "@/components/Modal";
import { Connection, secondary } from "./types";

export default function GoogleSheetsReplaceDialog({ connection, onClose, onUpdated }: { connection: Connection; onClose: () => void; onUpdated: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [trashPrevious, setTrashPrevious] = useState(false);
  const [message, setMessage] = useState("");
  async function replace() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/google-sheets/connections/${connection.id}/replace`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spreadsheetId: connection.spreadsheetId, confirm: true, trashPrevious }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không thể thay Sheet.");
      setCompleted(true);
      await onUpdated();
      if (result.cleanupPending) setMessage("Sheet mới đã hoạt động. Chưa dọn xong kênh theo dõi hoặc Sheet cũ; không cần tạo lại Sheet mới.");
      else onClose();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể kết nối."); }
    finally { setBusy(false); }
  }
  return <Modal title="Thay thế Google Sheet?" onClose={() => { if (!busy) onClose(); }}>
    <p className="font-semibold">{connection.spreadsheetName}</p>
    <p className="my-3 text-sm">Tạo Sheet mới từ từ vựng hiện tại, giữ nguyên ID và dữ liệu học. Chỉ chuyển kết nối sau khi Sheet mới vượt qua kiểm tra nội dung và đồng bộ ban đầu. Nếu chuẩn bị thất bại, Sheet cũ không bị ngắt.</p>
    {connection.managedByLexora && <label className="flex gap-2 text-sm"><input type="checkbox" checked={trashPrevious} disabled={busy} onChange={event => setTrashPrevious(event.target.checked)} />Đưa Sheet cũ vào Thùng rác sau khi thay thành công (không xóa từ vựng).</label>}
    {message && <p role="status" className="my-3 text-sm">{message}</p>}
    <div className="mt-4 flex gap-2"><button className={secondary} disabled={busy} onClick={onClose}>{completed ? "Đóng" : "Hủy"}</button><button className={secondary} disabled={busy || completed} onClick={() => void replace()}>{busy ? "Đang chuẩn bị và kiểm tra…" : completed ? "Đã thay Sheet" : "Tạo Sheet thay thế"}</button></div>
  </Modal>;
}
