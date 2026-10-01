"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cx } from "@/components/ui";
import { toast } from "@/components/Toast";

type Connection = {
  id: number;
  setId: number;
  spreadsheetId: string;
  spreadsheetUrl: string;
  spreadsheetName: string;
  sheetTitle: string;
  templateType: string;
  templateVersion: number;
  deleteBehavior: string;
  enabled: boolean;
  status: string;
  lastSyncedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastError: string | null;
  wordCount: number;
  columnCount: number;
  channelExpiresAt: string | null;
};

const STATUS_LABEL: Record<string, { label: string; dot: string; className: string }> = {
  connected: { label: "Đã kết nối", dot: "bg-emerald-500", className: "text-emerald-700" },
  syncing: { label: "Đang đồng bộ", dot: "bg-amber-500 animate-pulse", className: "text-amber-700" },
  paused: { label: "Đã tạm dừng", dot: "bg-orange-500", className: "text-orange-700" },
  error: { label: "Lỗi", dot: "bg-red-500", className: "text-red-700" },
  disconnected: { label: "Ngắt kết nối", dot: "bg-gray-400", className: "text-gray-600" },
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function GoogleSheetsPanel({ setId, canManage, canSync, isAdmin }: { setId: number; canManage: boolean; canSync: boolean; isAdmin: boolean }) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [preview, setPreview] = useState<{ templateType: string; columns: number; existingWords: number; rowsToExport: number } | null>(null);
  const [connectMode, setConnectMode] = useState(false);
  const [connectUrl, setConnectUrl] = useState("");
  const [connectSheet, setConnectSheet] = useState("");
  const [showRuns, setShowRuns] = useState(false);
  const [runs, setRuns] = useState<Array<{ id: number; triggerType: string; startedAt: string; finishedAt: string | null; status: string; rowsCreated: number; rowsUpdated: number; rowsUnchanged: number; rowsDeleted: number; errorMessage: string | null }>>([]);

  const connection = connections.find((item) => item.setId === setId) ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/google-sheets/connections?setId=${setId}`);
      if (!response.ok) return;
      const data = await response.json();
      setConnections(data.connections || []);
    } catch { /* keep prior state */ } finally { setLoading(false); }
  }, [setId]);

  useEffect(() => { void load(); }, [load]);

  async function openCreatePreview() {
    setBusy("preview");
    try {
      const response = await fetch(`/api/admin/google-sheets/connections?setId=${setId}`);
      const data = await response.json();
      const existing = (data.connections || []).find((item: Connection) => item.setId === setId);
      setPreview({ templateType: existing?.templateType ?? (setId ? "ielts_vocab" : "ielts_vocab"), columns: existing?.columnCount ?? 16, existingWords: existing?.wordCount ?? 0, rowsToExport: existing?.wordCount ?? 0 });
      setShowPreview(true);
    } catch { toast("Không thể tải thông tin preview."); } finally { setBusy(null); }
  }

  async function createSheet() {
    setBusy("create");
    try {
      const response = await fetch("/api/admin/google-sheets/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ setId }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { toast(data.error || "Không thể tạo Google Sheet."); return; }
      toast(`Đã tạo Google Sheet và xuất ${data.exportedRows} từ vựng.`);
      setShowPreview(false);
      await load();
    } catch { toast("Không thể kết nối để tạo Google Sheet."); } finally { setBusy(null); }
  }

  async function syncNow() {
    if (!connection) return;
    setBusy("sync");
    try {
      const response = await fetch(`/api/admin/google-sheets/connections/${connection.id}/sync`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { toast(data.error || "Không thể đồng bộ."); return; }
      const stats = data.stats || {};
      toast(`Đồng bộ xong: +${stats.rowsCreated || 0} tạo mới, ~${stats.rowsUpdated || 0} cập nhật, =${stats.rowsUnchanged || 0} giữ nguyên.`);
      await load();
    } catch { toast("Không thể kết nối để đồng bộ."); } finally { setBusy(null); }
  }

  async function togglePause() {
    if (!connection) return;
    setBusy("pause");
    const nextEnabled = !connection.enabled;
    try {
      const response = await fetch(`/api/admin/google-sheets/connections/${connection.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: nextEnabled, status: nextEnabled ? "connected" : "paused" }) });
      if (!response.ok) { toast("Không thể đổi trạng thái đồng bộ."); return; }
      await load();
      toast(nextEnabled ? "Đã tiếp tục đồng bộ." : "Đã tạm dừng đồng bộ.");
    } catch { toast("Không thể kết nối."); } finally { setBusy(null); }
  }

  async function disconnect() {
    if (!connection) return;
    if (!window.confirm("Ngắt kết nối Google Sheet? Từ vựng và dữ liệu học tập trong Lexora sẽ không bị xóa.")) return;
    setBusy("disconnect");
    try {
      const response = await fetch(`/api/admin/google-sheets/connections/${connection.id}`, { method: "DELETE" });
      if (!response.ok) { toast("Không thể ngắt kết nối."); return; }
      await load();
      toast("Đã ngắt kết nối Google Sheet.");
    } catch { toast("Không thể kết nối."); } finally { setBusy(null); }
  }

  async function connectExisting() {
    setBusy("connect");
    try {
      const response = await fetch("/api/admin/google-sheets/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ setId, spreadsheetUrl: connectUrl.trim(), sheetTitle: connectSheet.trim() || "Sheet1" }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { toast(data.error || "Không thể kết nối Sheet hiện có."); return; }
      toast("Đã kết nối Sheet hiện có và đồng bộ ban đầu.");
      setConnectMode(false); setConnectUrl(""); setConnectSheet("");
      await load();
    } catch { toast("Không thể kết nối."); } finally { setBusy(null); }
  }

  async function loadRuns() {
    if (!connection) return;
    setBusy("runs");
    try {
      const response = await fetch(`/api/admin/google-sheets/connections/${connection.id}/runs`);
      const data = await response.json().catch(() => ({}));
      setRuns(data.runs || []);
      setShowRuns(true);
    } catch { toast("Không thể tải lịch sử đồng bộ."); } finally { setBusy(null); }
  }

  const statusMeta = connection ? STATUS_LABEL[connection.status] || STATUS_LABEL.disconnected : null;

  const previewTemplateLabel = useMemo(() => {
    if (!preview) return "";
    if (preview.templateType === "irregular_verb") return "Động từ bất quy tắc";
    if (preview.templateType === "language_vocab_mandarin") return "Từ vựng tiếng Trung";
    return "Từ vựng IELTS";
  }, [preview]);

  if (!isAdmin) return null;

  return (
    <section className="mb-6 rounded-xl border border-line bg-white p-4" aria-label="Google Sheets Sync">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-serif text-lg">Google Sheets Sync</h3>
          <p className="mt-1 text-xs text-muted">Google Sheet trở thành nơi nhập và chỉnh sửa vocabulary; Lexora tự đồng bộ về PostgreSQL.</p>
        </div>
        {connection && statusMeta && (
          <span className={`flex items-center gap-2 text-sm font-bold ${statusMeta.className}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${statusMeta.dot}`} />
            {statusMeta.label}
          </span>
        )}
      </div>

      {!connection && (
        <div className="rounded-[11px] border border-line bg-[#FBFAFE] p-4">
          <p className="text-sm font-semibold">Google Sheet: Chưa kết nối</p>
          <p className="mt-1 text-xs text-muted">Lexora sẽ tự tạo Sheet, tự sinh header theo loại bộ và đưa toàn bộ từ vựng hiện tại vào Sheet.</p>
          {canManage && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={cx.btn} disabled={busy !== null} onClick={() => void openCreatePreview()}>
                {busy === "preview" ? "Đang chuẩn bị..." : "Tạo Google Sheet"}
              </button>
              <button type="button" className={cx.btnGhost} disabled={busy !== null} onClick={() => setConnectMode((value) => !value)}>
                Kết nối Sheet hiện có
              </button>
            </div>
          )}
        </div>
      )}

      {connection && (
        <div className="rounded-[11px] border border-line bg-[#FBFAFE] p-4">
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted">Spreadsheet</dt><dd className="truncate font-semibold">{connection.spreadsheetName}</dd></div>
            <div><dt className="text-xs text-muted">Tab</dt><dd className="font-semibold">{connection.sheetTitle}</dd></div>
            <div><dt className="text-xs text-muted">Lần đồng bộ cuối</dt><dd>{formatDate(connection.lastSuccessfulSyncAt || connection.lastSyncedAt)}</dd></div>
            <div><dt className="text-xs text-muted">Số từ</dt><dd>{connection.wordCount}</dd></div>
            <div><dt className="text-xs text-muted">Chính sách xóa</dt><dd>{connection.deleteBehavior === "archive" ? "Lưu trữ (an toàn)" : connection.deleteBehavior === "delete" ? "Xóa cứng" : "Bỏ qua"}</dd></div>
            <div><dt className="text-xs text-muted">Channel hết hạn</dt><dd>{formatDate(connection.channelExpiresAt)}</dd></div>
          </dl>
          {connection.lastError && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">Lỗi gần nhất: {connection.lastError}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <a className={cx.btnGhost} href={connection.spreadsheetUrl} target="_blank" rel="noopener noreferrer">Mở Google Sheet ↗</a>
            {canSync && <button type="button" className={cx.btnGold} disabled={busy !== null} onClick={() => void syncNow()}>{busy === "sync" ? "Đang đồng bộ..." : "Đồng bộ ngay"}</button>}
            <button type="button" className={cx.btnGhost} disabled={busy !== null} onClick={() => void loadRuns()}>Lịch sử đồng bộ</button>
            {canManage && <button type="button" className={cx.btnGhost} disabled={busy !== null} onClick={() => void togglePause()}>{connection.enabled ? "Tạm dừng" : "Tiếp tục"}</button>}
            {canManage && <button type="button" className={cx.btnDanger} disabled={busy !== null} onClick={() => void disconnect()}>Ngắt kết nối</button>}
          </div>
        </div>
      )}

      {showPreview && preview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h4 className="font-serif text-base">Google Sheet template</h4>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Loại</dt><dd className="font-semibold">{previewTemplateLabel}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Số cột</dt><dd>{preview.columns}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Từ vựng hiện tại</dt><dd>{preview.existingWords}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Dòng sẽ xuất</dt><dd>{preview.rowsToExport}</dd></div>
            </dl>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={cx.btnGhost} onClick={() => setShowPreview(false)}>Hủy</button>
              <button type="button" className={cx.btnGold} disabled={busy === "create"} onClick={() => void createSheet()}>{busy === "create" ? "Đang tạo..." : "Tạo"}</button>
            </div>
          </div>
        </div>
      )}

      {connectMode && (
        <div className="mt-3 rounded-[11px] border border-line bg-white p-4">
          <label className={cx.label} htmlFor="gs-connect-url">Link Google Sheet</label>
          <input id="gs-connect-url" className={cx.input} placeholder="https://docs.google.com/spreadsheets/d/..." value={connectUrl} onChange={(event) => setConnectUrl(event.target.value)} />
          <label className={cx.label} htmlFor="gs-connect-sheet">Tên tab (mặc định Sheet1)</label>
          <input id="gs-connect-sheet" className={cx.input} placeholder="Sheet1" value={connectSheet} onChange={(event) => setConnectSheet(event.target.value)} />
          <div className="mt-3 flex gap-2">
            <button type="button" className={cx.btnGold} disabled={busy !== null || !connectUrl.trim()} onClick={() => void connectExisting()}>{busy === "connect" ? "Đang kết nối..." : "Kết nối"}</button>
            <button type="button" className={cx.btnGhost} onClick={() => setConnectMode(false)}>Hủy</button>
          </div>
        </div>
      )}

      {showRuns && (
        <div className="mt-3 rounded-[11px] border border-line bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="font-semibold">Lịch sử đồng bộ</h4>
            <button type="button" className="text-xs font-bold text-gold hover:underline" onClick={() => setShowRuns(false)}>Đóng</button>
          </div>
          {runs.length === 0 ? <p className="text-sm text-muted">Chưa có lần đồng bộ nào.</p> : (
            <ul className="space-y-2 text-xs">
              {runs.map((run) => (
                <li key={run.id} className="rounded-lg border border-line p-2">
                  <div className="flex justify-between"><b>{run.triggerType}</b><span>{run.status}</span></div>
                  <div className="mt-1 text-muted">{formatDate(run.finishedAt || run.startedAt)} · +{run.rowsCreated} tạo mới · ~{run.rowsUpdated} cập nhật · ={run.rowsUnchanged} giữ nguyên · −{run.rowsDeleted} lưu trữ</div>
                  {run.errorMessage && <div className="mt-1 text-red-600">{run.errorMessage}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
