"use client";

import { useState } from "react";
import { toast } from "@/components/Toast";
import { Connection, SyncRun, formatDate, secondary } from "./types";
import type { ConflictDetail, SyncRequest, WordChange } from "@/lib/googleSheets/reliability";

export default function GoogleSheetsReliability({ connection, run, canManage, canSync, onUpdated }: { connection: Connection; run: SyncRun | null; canManage: boolean; canSync: boolean; onUpdated: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<{ label: string; policy?: string; request?: SyncRequest } | null>(null);
  let metadata: { conflictRows?: ConflictDetail[]; conflicts?: number; deletionBlocked?: number; changes?: WordChange[] } = {};
  try { metadata = JSON.parse(run?.metadata || "{}"); } catch { metadata = {}; }
  const conflicts = metadata.conflictRows ?? [];
  const partial = run?.status === "partial" || (metadata.conflicts ?? 0) > 0 || (metadata.deletionBlocked ?? 0) > 0;

  async function execute(policy?: string, request?: SyncRequest) {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/google-sheets/connections/${connection.id}${policy ? "" : "/sync"}`, {
        method: policy ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(policy ? { conflictPolicy: policy } : request ?? {}),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không thể thực hiện tác vụ.");
      toast(policy ? "Đã lưu chính sách đồng bộ." : result.status === "partial" ? "Đồng bộ một phần. Hãy kiểm tra các dòng cần xử lý." : "Đã đồng bộ và kiểm tra kết nối.");
      setConfirmation(null);
      await onUpdated();
    } catch (error) { toast(error instanceof Error ? error.message : "Không thể kết nối."); }
    finally { setBusy(false); }
  }

  return <div className="mt-4 space-y-3 rounded-xl border border-line p-4 text-sm">
    <h4 className="font-semibold">Kiểm tra đồng bộ và xử lý dữ liệu</h4>
    <p>Lần đọc Sheet: {formatDate(connection.lastSyncedAt)} · Thông báo Google: {formatDate(connection.lastNotificationAt ?? null)}</p>
    <p>Kênh thông báo: {!connection.channelExpiresAt ? "Chưa được thiết lập" : new Date(connection.channelExpiresAt).getTime() <= Date.now() ? "Đã hết hạn" : `Hết hạn ${formatDate(connection.channelExpiresAt)}`}</p>
    <p>Nguồn chính: {connection.conflictPolicy === "sheet" ? "Google Sheet — thay đổi trên website có thể bị ghi đè" : "Kiểm tra xung đột trước khi ghi đè"}</p>
    {canManage && <button className={secondary} disabled={busy} onClick={() => setConfirmation({ label: connection.conflictPolicy === "sheet" ? "Chuyển về kiểm tra xung đột?" : "Lấy Google Sheet làm nguồn chính? Các trường đồng bộ trên website sẽ bị ghi đè theo Sheet từ lần đồng bộ tiếp theo. Tiến độ học tập vẫn giữ nguyên.", policy: connection.conflictPolicy === "sheet" ? "review" : "sheet" })}>Đổi nguồn chính</button>}
    {canManage && canSync && <button className={secondary} disabled={busy || !connection.enabled || connection.status === "disconnected"} onClick={() => void execute(undefined, { repairWatch: true })}>Kiểm tra và sửa kết nối</button>}
    {partial && <p role="status" className="rounded-lg bg-amber-50 p-3 text-amber-800">Đồng bộ một phần: {metadata.conflicts ?? conflicts.length} xung đột, {run?.validationErrorCount ?? 0} dòng không hợp lệ, {metadata.deletionBlocked ?? 0} dòng được bảo vệ khỏi xóa hàng loạt. Mở lịch sử để xem chi tiết.</p>}
    {!!metadata.deletionBlocked && <p>Đã chặn xóa/lưu trữ nhiều từ cùng lúc. Khôi phục các dòng trên Sheet hoặc dùng chức năng quản lý từ vựng để xác nhận xóa từng từ; không tự động xóa dữ liệu học tập.</p>}
    {conflicts.map((row) => <div key={row.sourceId} className="space-y-2 rounded-lg border border-line p-3">
      <b>Dòng {row.rowNumber}: {row.word}</b>
      {row.before && row.after ? <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th>Trường</th><th>Website</th><th>Google Sheet</th></tr></thead><tbody>{Object.keys(row.after).filter((key) => row.before[key] !== row.after[key]).map((key) => <tr key={key}><td className="p-2">{key}</td><td className="p-2 whitespace-pre-wrap">{row.before[key] || "—"}</td><td className="p-2 whitespace-pre-wrap">{row.after[key] || "—"}</td></tr>)}</tbody></table></div> : <p>Chạy đồng bộ lại để có dữ liệu so sánh mới nhất.</p>}
      {canManage && canSync && row.sheetFingerprint && row.dbFingerprint && (["sheet", "website"] as const).map((choice) => <button key={choice} className={secondary} disabled={busy} onClick={() => setConfirmation({ label: choice === "sheet" ? `Lấy nội dung trên Sheet cho “${row.word}”? Bản trước khi ghi đè sẽ lưu trong lịch sử.` : `Giữ bản website cho “${row.word}”? Không ghi ngược lên Sheet; một thay đổi mới trên Sheet vẫn sẽ được kiểm tra lại.`, request: { resolutions: [{ sourceId: row.sourceId, choice, sheetFingerprint: row.sheetFingerprint, dbFingerprint: row.dbFingerprint }] } })}>{choice === "sheet" ? "Lấy từ Sheet" : "Giữ bản website"}</button>)}
      <p className="text-xs text-muted">Có thể xử lý sau bằng cách bỏ qua dòng này.</p>
    </div>)}
    {confirmation && <div role="alert" className="space-y-3 rounded-lg bg-amber-50 p-3"><p>{confirmation.label}</p><button className={secondary} disabled={busy} onClick={() => void execute(confirmation.policy, confirmation.request)}>Xác nhận</button><button className={secondary} disabled={busy} onClick={() => setConfirmation(null)}>Hủy</button></div>}
  </div>;
}
