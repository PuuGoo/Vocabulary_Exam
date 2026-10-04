"use client";

import { useState } from "react";
import GoogleSheetsReplaceDialog from "./GoogleSheetsReplaceDialog";
import GoogleSheetsResourcesDialog from "./GoogleSheetsResourcesDialog";
import type { DeletionReview, UpdateReview } from "@/lib/googleSheets/bulkReview";
import GoogleSheetsTrashDialog from "./GoogleSheetsTrashDialog";
import GoogleSheetsHealthDialog from "./GoogleSheetsHealthDialog";
import GoogleSheetsRepairDialog from "./GoogleSheetsRepairDialog";
import { toast } from "@/components/Toast";
import { Connection, SyncRun, formatDate, secondary } from "./types";
import type { ConflictDetail, SyncRequest, WordChange } from "@/lib/googleSheets/reliability";

export default function GoogleSheetsReliability({ connection, run, canManage, canSync, onUpdated }: { connection: Connection; run: SyncRun | null; canManage: boolean; canSync: boolean; onUpdated: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  const [repairOpen, setRepairOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<{ label: string; policy?: string; request?: SyncRequest } | null>(null);
  let metadata: { conflictRows?: ConflictDetail[]; conflicts?: number; deletionBlocked?: number; deletionReview?: DeletionReview; updateReview?: UpdateReview; changes?: WordChange[] } = {};
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
    <button className={secondary} disabled={busy} onClick={() => setResourcesOpen(true)}>Lịch sử tài nguyên Sheet</button>
    {resourcesOpen && <GoogleSheetsResourcesDialog connectionId={connection.id} onClose={() => setResourcesOpen(false)} />}
    {canManage && <button className={secondary} disabled={busy} onClick={() => setReplaceOpen(true)}>Thay thế Google Sheet</button>}
    {replaceOpen && <GoogleSheetsReplaceDialog connection={connection} onClose={() => setReplaceOpen(false)} onUpdated={onUpdated} />}
    <h4 className="font-semibold">Kiểm tra đồng bộ và xử lý dữ liệu</h4>
    <button type="button" className={secondary} disabled={busy} onClick={() => setHealthOpen(true)}>Kiểm tra Sheet</button>
    {healthOpen && <GoogleSheetsHealthDialog connectionId={connection.id} onClose={() => setHealthOpen(false)} />}
    {canManage && connection.managedByLexora && connection.enabled && <button type="button" className={secondary} disabled={busy} onClick={() => setRepairOpen(true)}>Sửa hệ thống Sheet</button>}
    {repairOpen && <GoogleSheetsRepairDialog connection={connection} onClose={() => setRepairOpen(false)} onRepaired={onUpdated} />}
    <p>{connection.managedByLexora ? "Sheet do Lexora tạo" : "Sheet bên ngoài hoặc chưa xác minh quyền sở hữu"}</p>
    {canManage && connection.managedByLexora && connection.status !== "archived" && <button type="button" className={secondary} disabled={busy} onClick={() => setTrashOpen(true)}>Đưa Google Sheet vào Thùng rác</button>}
    {trashOpen && <GoogleSheetsTrashDialog connection={connection} onClose={() => setTrashOpen(false)} onTrashed={onUpdated} />}
    <p>Lần đọc Sheet: {formatDate(connection.lastSyncedAt)} · Thông báo Google: {formatDate(connection.lastNotificationAt ?? null)}</p>
    <p>Kênh thông báo: {!connection.channelExpiresAt ? "Chưa được thiết lập" : new Date(connection.channelExpiresAt).getTime() <= Date.now() ? "Đã hết hạn" : `Hết hạn ${formatDate(connection.channelExpiresAt)}`}</p>
    <p>Nguồn chính: {connection.conflictPolicy === "sheet" ? "Google Sheet — thay đổi trên website có thể bị ghi đè" : "Kiểm tra xung đột trước khi ghi đè"}</p>
    {canManage && <button className={secondary} disabled={busy} onClick={() => setConfirmation({ label: connection.conflictPolicy === "sheet" ? "Chuyển về kiểm tra xung đột?" : "Lấy Google Sheet làm nguồn chính? Các trường đồng bộ trên website sẽ bị ghi đè theo Sheet từ lần đồng bộ tiếp theo. Tiến độ học tập vẫn giữ nguyên.", policy: connection.conflictPolicy === "sheet" ? "review" : "sheet" })}>Đổi nguồn chính</button>}
    {canManage && canSync && <button className={secondary} disabled={busy || !connection.enabled || connection.status === "disconnected"} onClick={() => void execute(undefined, { repairWatch: true })}>Kiểm tra và sửa kết nối</button>}
    {partial && <p role="status" className="rounded-lg bg-amber-50 p-3 text-amber-800">Đồng bộ một phần: {metadata.conflicts ?? conflicts.length} xung đột, {run?.validationErrorCount ?? 0} dòng không hợp lệ, {metadata.deletionBlocked ?? 0} dòng được bảo vệ khỏi xóa hàng loạt. Mở lịch sử để xem chi tiết.</p>}
    {!!metadata.deletionBlocked && <p>Đã chặn xóa/lưu trữ nhiều từ cùng lúc. Khôi phục các dòng trên Sheet hoặc dùng chức năng quản lý từ vựng để xác nhận xóa từng từ; không tự động xóa dữ liệu học tập.</p>}
    {metadata.deletionReview && <details className="rounded-lg border border-amber-300 p-3">
      <summary>Xem {metadata.deletionReview.missingCount} từ bị thiếu trong {metadata.deletionReview.activeCount} dòng đang liên kết</summary>
      <p className="my-2">Chỉ áp dụng cho phiên bản Sheet và dữ liệu vừa kiểm tra. Nếu có thay đổi mới, hệ thống yêu cầu xem xét lại. Tiến độ học được giữ nguyên.</p>
      <ul className="max-h-64 overflow-y-auto">{metadata.deletionReview.rows.map(row => <li key={row.sourceId}>{row.word} · {row.sourceId} · #{row.wordId}</li>)}</ul>
      {canManage && canSync && <button type="button" className={secondary} disabled={busy} onClick={() => setConfirmation({ label: `Xác nhận áp dụng ${metadata.deletionReview!.missingCount} dòng thiếu theo chính sách ${connection.deleteBehavior}? Dữ liệu trước thay đổi được lưu trong lịch sử.`, request: { deletionApproval: metadata.deletionReview!.fingerprint } })}>Tiếp tục với danh sách đã xem</button>}
    </details>}
    {metadata.updateReview && <details className="rounded-lg border border-amber-300 p-3">
      <summary>Phát hiện thay đổi lớn: {metadata.updateReview.changedCount}/{metadata.updateReview.activeCount} từ sẽ cập nhật</summary>
      <p className="my-2">Chưa ghi đè các từ bên dưới. Hãy xem nội dung cũ/mới trước khi tiếp tục hoặc đóng để hủy xác nhận.</p>
      <div className="max-h-80 space-y-3 overflow-auto">{metadata.updateReview.rows.map(row => <div key={row.wordId}><b>{row.word} · {row.sourceId} · dòng {row.rowNumber}</b>{row.fieldsChanged?.map(field => <p key={field} className="whitespace-pre-wrap">{field}: {row.before[field] || "(trống)"} → {row.after[field] || "(trống)"}</p>)}</div>)}</div>
      {canManage && canSync && <button className={secondary} disabled={busy} onClick={() => setConfirmation({ label: `Áp dụng ${metadata.updateReview!.changedCount} cập nhật đã xem?`, request: { updateApproval: metadata.updateReview!.fingerprint } })}>Tiếp tục với các thay đổi đã xem</button>}
    </details>}
    {conflicts.map((row) => <div key={row.sourceId} className="space-y-2 rounded-lg border border-line p-3">
      <b>Dòng {row.rowNumber}: {row.word}</b>
      {row.before && row.after ? <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th>Trường</th><th>Website</th><th>Google Sheet</th></tr></thead><tbody>{Object.keys(row.after).filter((key) => row.before[key] !== row.after[key]).map((key) => <tr key={key}><td className="p-2">{key}</td><td className="p-2 whitespace-pre-wrap">{row.before[key] || "—"}</td><td className="p-2 whitespace-pre-wrap">{row.after[key] || "—"}</td></tr>)}</tbody></table></div> : <p>Chạy đồng bộ lại để có dữ liệu so sánh mới nhất.</p>}
      {canManage && canSync && row.sheetFingerprint && row.dbFingerprint && (["sheet", "website"] as const).map((choice) => <button key={choice} className={secondary} disabled={busy} onClick={() => setConfirmation({ label: choice === "sheet" ? `Lấy nội dung trên Sheet cho “${row.word}”? Bản trước khi ghi đè sẽ lưu trong lịch sử.` : `Giữ bản website cho “${row.word}”? Không ghi ngược lên Sheet; một thay đổi mới trên Sheet vẫn sẽ được kiểm tra lại.`, request: { resolutions: [{ sourceId: row.sourceId, choice, sheetFingerprint: row.sheetFingerprint, dbFingerprint: row.dbFingerprint }] } })}>{choice === "sheet" ? "Lấy từ Sheet" : "Giữ bản website"}</button>)}
      <p className="text-xs text-muted">Có thể xử lý sau bằng cách bỏ qua dòng này.</p>
    </div>)}
    {confirmation && <div role="alert" className="space-y-3 rounded-lg bg-amber-50 p-3"><p>{confirmation.label}</p><button className={secondary} disabled={busy} onClick={() => void execute(confirmation.policy, confirmation.request)}>Xác nhận</button><button className={secondary} disabled={busy} onClick={() => setConfirmation(null)}>Hủy</button></div>}
  </div>;
}
