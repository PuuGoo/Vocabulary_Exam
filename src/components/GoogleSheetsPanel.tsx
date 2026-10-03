"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Connection, SyncRun, formatClock } from "./google-sheets/types";
import GoogleSheetsEmptyState from "./google-sheets/GoogleSheetsEmptyState";
import GoogleSheetsDetails from "./google-sheets/GoogleSheetsDetails";
import GoogleSheetsBrokenCard from "./google-sheets/GoogleSheetsBrokenCard";
import GoogleSheetsCreateDialog from "./google-sheets/GoogleSheetsCreateDialog";
import GoogleSheetsCreateSuccess from "./google-sheets/GoogleSheetsCreateSuccess";
import GoogleSheetsConnectDialog, { ConnectPreview } from "./google-sheets/GoogleSheetsConnectDialog";
import GoogleSheetsPauseDialog from "./google-sheets/GoogleSheetsPauseDialog";
import GoogleSheetsDisconnectDialog from "./google-sheets/GoogleSheetsDisconnectDialog";
import GoogleSheetsRecoveryDialog from "./google-sheets/GoogleSheetsRecoveryDialog";
import GoogleSheetsSettings from "./google-sheets/GoogleSheetsSettings";
import GoogleSheetsSyncHistory from "./google-sheets/GoogleSheetsSyncHistory";
import GoogleSheetsSyncRunDetails from "./google-sheets/GoogleSheetsSyncRunDetails";
import { toast } from "@/components/Toast";

type CreateResume = { autoCreate: boolean; failed: boolean; onHandled: () => void };
type Dialog = "create" | "connect" | "pause" | "disconnect" | "recover" | "settings" | "history" | "changes" | "success" | null;

export default function GoogleSheetsPanel({ setId, canManage, canSync, isAdmin, createResume }: { setId: number; canManage: boolean; canSync: boolean; isAdmin: boolean; createResume?: CreateResume | null }) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [createPhase, setCreatePhase] = useState<"idle" | "connecting" | "creating">("idle");
  const [resumeCreate, setResumeCreate] = useState(false);
  const [canCreateNew, setCanCreateNew] = useState(false);
  const [connectUrl, setConnectUrl] = useState("");
  const [connectTab, setConnectTab] = useState("");
  const [connectPreview, setConnectPreview] = useState<ConnectPreview | null>(null);
  const [connectError, setConnectError] = useState("");
  const [recoverResult, setRecoverResult] = useState("");
  const [channel, setChannel] = useState<Record<string, unknown> | null>(null);
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<SyncRun | null>(null);
  const [invalid, setInvalid] = useState<Array<{ rowNumber: number; message: string }>>([]);
  const [success, setSuccess] = useState<{ count: number; url: string } | null>(null);
  // Decided before the create dialog: does the new Sheet get native AI formulas?
  const [aiEnrichChoice, setAiEnrichChoice] = useState(true);
  const [feedback, setFeedback] = useState("");


  const seenRunRef = useRef<string | null>(null);
  const connection = connections.find((item) => item.setId === setId) ?? null;
  const broken = !!connection && (connection.status === "error" || connection.status === "disconnected");
  const latestRun = runs.find((run) => run.status === "success") ?? runs[0] ?? null;

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/google-sheets/connections?setId=${setId}`);
      if (!response.ok) return;
      const data = await response.json();
      setConnections(data.connections || []);
      const found = (data.connections || []).find((item: Connection) => item.setId === setId);
      setCanCreateNew(found ? found.status !== "error" && found.status !== "disconnected" : false);
    } catch { /* keep prior state */ }
  }, [setId]);

  const loadChannel = useCallback(async (id: number) => {
    try {
      const response = await fetch(`/api/admin/google-sheets/connections/${id}`);
      const data = await response.json().catch(() => ({}));
      setChannel(data.channel ?? null);
    } catch { setChannel(null); }
  }, []);

  const loadRuns = useCallback(async (id: number) => {
    setBusy("runs");
    try {
      const response = await fetch(`/api/admin/google-sheets/connections/${id}/runs`);
      const data = await response.json().catch(() => ({}));
      setRuns(data.runs || []);
    } catch { toast("Không thể tải lịch sử đồng bộ."); } finally { setBusy(null); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!createResume) return;
    if (connection) { createResume.onHandled(); return; }
    if (createResume.failed) { setResumeCreate(true); createResume.onHandled(); return; }
    if (createResume.autoCreate) { createResume.onHandled(); void createSheet(); }
    else { setResumeCreate(true); createResume.onHandled(); }
  }, [createResume, connection]);

  useEffect(() => { if (connection) void loadChannel(connection.id); }, [connection, loadChannel]);
  useEffect(() => { if (connection && !broken) void loadRuns(connection.id); }, [connection, broken, loadRuns]);

  /**
   * Create the spreadsheet for this set.
   *
   * A missing Google connection is not an error state: the API answers 202
   * with an oauthUrl, and we send the admin straight into the existing
   * OAuth flow (Kết nối Google để tiếp tục) instead of showing a 401.
   */
  async function createSheet() {
    if (createPhase !== "idle") return;
    setCreatePhase("creating");
    setBusy("create");
    try {
      const response = await fetch("/api/admin/google-sheets/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ setId, aiEnrich: aiEnrichChoice }) });
      const data = await response.json().catch(() => ({}));
      if (data.oauthRequired && data.oauthUrl) {
        setCreatePhase("connecting");
        toast("Đang kết nối Google...");
        window.location.assign(String(data.oauthUrl));
        return;
      }
      if (data.alreadyConnected && !data.recovered) {
        setDialog(null);
        toast("Google Sheet đã được kết nối cho bộ từ này.");
        await load();
        return;
      }
      if (data.recovered) {
        setDialog(null);
        setResumeCreate(false);
        toast("Đã khôi phục kết nối Google Sheet.");
        await load();
        return;
      }
      if (!response.ok) {
        if (data.code === "NOT_CONFIGURED") { setResumeCreate(true); }
        // A healthy sheet must never read as a generic failure, and a broken one
        // must offer recovery instead of an opaque "Conflict".
        if (data.alreadyConnected) {
          setDialog(null);
          toast(data.error || "Google Sheet đã được kết nối cho bộ từ này.");
          await load();
          return;
        }
        if (data.needsRecovery) {
          setDialog(null);
          setRecoverResult(data.error || "");
          setDialog("recover");
          return;
        }
        if (data.code === "RATE_LIMITED") { toast(data.error || "Google Sheet đang được tạo bởi yêu cầu khác. Vui lòng chờ lại."); return; }
        toast(data.error || "Không thể tạo Google Sheet lúc này.");
        return;
      }
      setDialog(null);
      setResumeCreate(false);
      if (data.connectionId) {
        setSuccess({ count: data.wordCount ?? data.exported ?? 0, url: data.spreadsheetUrl });
        setDialog("success");
      } else {
        toast("Tạo Google Sheet thành công.");
      }
      await load();
    } catch {
      setCreatePhase("idle");
      toast("Không thể kết nối để tạo Google Sheet.");
    } finally {
      setBusy(null);
      setCreatePhase("idle");
    }
  }

  async function recoverConnection() {
    if (!connection) return;
    setBusy("recover");
    try {
      const response = await fetch(`/api/admin/google-sheets/connections/${connection.id}/recover`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.spreadsheetGone) { setCanCreateNew(true); toast(data.error || "Google Sheet không còn. Bạn có thể tạo Sheet mới."); return; }
        setRecoverResult(data.error || "Không thể khôi phục kết nối.");
        return;
      }
      setRecoverResult("");
      setDialog(null);
      toast("Đã khôi phục kết nối Google Sheet.");
      await load();
    } catch { setRecoverResult("Không thể khôi phục kết nối."); } finally { setBusy(null); }
  }

  async function syncNow(source: "card" | "settings" = "card") {
    void source;
    if (!connection) return;
    setBusy("sync");
    try {
      const response = await fetch(`/api/admin/google-sheets/connections/${connection.id}/sync`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { toast(data.error || "Không thể đồng bộ."); return; }
      const stats = data.stats || {};
      const invalidRows: Array<{ rowNumber: number; message: string }> = Array.isArray(stats.invalidRows) ? stats.invalidRows : [];
      setInvalid(invalidRows);
      const summary = `Đồng bộ xong: +${stats.rowsCreated || 0} tạo mới, ~${stats.rowsUpdated || 0} cập nhật, =${stats.rowsUnchanged || 0} giữ nguyên.`;
      toast(invalidRows.length ? `${summary} Bỏ qua ${invalidRows.length} dòng: ${invalidRows.slice(0, 2).map((row) => `dòng ${row.rowNumber} ${row.message}`).join("; ")}${invalidRows.length > 2 ? "…" : ""}` : summary);
      await load();
      await loadRuns(connection.id);
    } catch { toast("Không thể kết nối để đồng bộ."); } finally { setBusy(null); }
  }

  async function togglePause() {
    if (!connection) return;
    setBusy("pause");
    const nextEnabled = !connection.enabled;
    try {
      const response = await fetch(`/api/admin/google-sheets/connections/${connection.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: nextEnabled, status: nextEnabled ? "connected" : "paused" }) });
      if (!response.ok) { toast("Không thể đổi trạng thái đồng bộ."); return; }
      setDialog(null);
      await load();
      toast(nextEnabled ? "Đã tiếp tục đồng bộ." : "Đã tạm dừng đồng bộ.");
    } catch { toast("Không thể kết nối."); } finally { setBusy(null); }
  }

  async function applyDeleteBehavior(value: string) {
    if (!connection) return;
    setBusy("delete");
    try {
      const response = await fetch(`/api/admin/google-sheets/connections/${connection.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deleteBehavior: value }) });
      if (!response.ok) { toast("Không thể lưu cài đặt."); return; }
      await load();
      toast("Đã lưu cài đặt.");
    } catch { toast("Không thể kết nối."); } finally { setBusy(null); }
  }

  async function applyAiEnrich(value: boolean) {
    if (!connection) return;
    setBusy("ai");
    try {
      const response = await fetch(`/api/admin/google-sheets/connections/${connection.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aiEnrich: value }) });
      if (!response.ok) { toast("Không thể lưu cài đặt."); return; }
      await load();
      toast(value ? "Đã bật Google Sheets AI enrichment." : "Đã tắt Google Sheets AI enrichment.");
    } catch { toast("Không thể kết nối."); } finally { setBusy(null); }
  }

  async function applyAiPrompts(value: Record<string, string>, handlers?: { onStats?: (stats: { updatedFormulaCells: number; blankCellsFilled: number; protectedUserCells: number; columnsUpdated: number; rowsScanned: number }) => void; onError?: (message: string) => void }) {
    if (!connection) return;
    setBusy("aiPrompts");
    try {
      // Operation B: save AND rewrite the EXISTING Sheet's AI formulas.
      const response = await fetch(`/api/admin/google-sheets/connections/${connection.id}/ai-prompts/apply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aiPrompts: value }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data.error || "Không thể cập nhật prompt AI trên Sheet.";
        handlers?.onError?.(message);
        toast(message);
        return;
      }
      await load();
      handlers?.onStats?.({
        updatedFormulaCells: data.updatedFormulaCells ?? 0,
        blankCellsFilled: data.blankCellsFilled ?? 0,
        protectedUserCells: data.protectedUserCells ?? 0,
        columnsUpdated: data.columnsUpdated ?? 0,
        rowsScanned: data.rowsScanned ?? 0,
      });
      toast("✓ Đã cập nhật prompt AI trên Sheet.");
    } catch { toast("Không thể kết nối."); } finally { setBusy(null); }
  }

  async function disconnectSheet() {
    if (!connection) return;
    setBusy("disconnect");
    try {
      const response = await fetch(`/api/admin/google-sheets/connections/${connection.id}`, { method: "DELETE" });
      if (!response.ok) { toast("Không thể ngắt kết nối."); return; }
      setDialog(null);
      await load();
      toast("Đã ngắt kết nối Google Sheet.");
    } catch { toast("Không thể kết nối."); } finally { setBusy(null); }
  }

  async function verifyConnect() {
    setBusy("connect");
    setConnectError("");
    try {
      const response = await fetch("/api/admin/google-sheets/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ setId, spreadsheetUrl: connectUrl.trim(), sheetTitle: connectTab.trim() || "Sheet1", preview: true }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setConnectError(data.error || "Không thể kiểm tra Sheet. Vui lòng thử lại."); return; }
      setConnectPreview(data);
      setConnectTab(data.sheetTitle || connectTab || "Sheet1");
    } catch { setConnectError("Không thể kiểm tra Sheet. Vui lòng thử lại."); } finally { setBusy(null); }
  }

  async function connectExisting() {
    setBusy("connect");
    setConnectError("");
    try {
      const response = await fetch("/api/admin/google-sheets/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ setId, spreadsheetUrl: connectUrl.trim(), sheetTitle: connectTab.trim() || "Sheet1" }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setConnectError(data.error || "Không thể kết nối Sheet hiện có."); return; }
      setDialog(null);
      setConnectUrl(""); setConnectTab(""); setConnectPreview(null);
      toast("Đã kết nối Sheet hiện có và đồng bộ ban đầu.");
      await load();
    } catch { setConnectError("Không thể kết nối."); } finally { setBusy(null); }
  }

  // A Google Sheets edit arrives as an ordinary sync run, so the card only
  // speaks up when a run it has not shown yet completes. No modal, no toast.
  useEffect(() => {
    if (!connection || broken) return;
    const newest = latestRun?.finishedAt ?? null;
    if (!newest) return;
    if (seenRunRef.current === null) { seenRunRef.current = newest; return; }
    if (seenRunRef.current === newest) return;
    seenRunRef.current = newest;
    setFeedback("↻ Đang cập nhật từ Google Sheets…");
    const timer = window.setTimeout(() => {
      setFeedback(`✓ Đã đồng bộ lúc ${formatClock(newest)}`);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [connection, broken, latestRun]);

  // Runs complete on the server; a light poll keeps the card truthful without
  // the admin ever pressing "Sync now".
  useEffect(() => {
    if (!connection || broken) return;
    const timer = window.setInterval(() => { void load(); void loadRuns(connection.id); }, 30000);
    return () => window.clearInterval(timer);
  }, [connection, broken, load, loadRuns]);

  if (!isAdmin) return null;

  return (
    <section className="mb-6 rounded-2xl border border-line bg-white p-4 sm:p-5" aria-label="Google Sheets">
      <div className="mb-4">
        <h3 className="font-serif text-lg font-semibold">Google Sheets</h3>
        <p className="mt-1 text-xs text-muted">Google Sheet là nơi chỉnh sửa vocabulary; Lexora tự đồng bộ về PostgreSQL.</p>
      </div>

      {!connection && (
        <GoogleSheetsEmptyState
          canManage={canManage}
          busy={busy !== null}
          resume={resumeCreate}
          onCreate={() => setDialog("create")}
          onConnect={() => { setConnectError(""); setConnectPreview(null); setDialog("connect"); }}
        />
      )}

      {connection && (connection.status === "error" || connection.status === "disconnected") && (
        <GoogleSheetsBrokenCard connection={connection} canManage={canManage} busy={busy !== null} canCreate={canCreateNew} onRecover={() => { setRecoverResult(connection.lastError || ""); setDialog("recover"); }} onCreateNew={() => setDialog("create")} />
      )}

      {connection && !(connection.status === "error" || connection.status === "disconnected") && (
        <GoogleSheetsDetails
          connection={connection}
          latestRun={latestRun}
          feedback={feedback}
          invalid={invalid}
          busy={busy !== null}
          onHistory={() => { void loadRuns(connection.id); setDialog("history"); }}
          onSettings={() => { void loadChannel(connection.id); setDialog("settings"); }}
          onChanges={() => setDialog("changes")}
          onRecover={() => { setRecoverResult(connection.lastError || ""); setDialog("recover"); }}
          onPause={() => setDialog("pause")}
          onDisconnect={() => setDialog("disconnect")}
          canManage={canManage}
        />
      )}

      {dialog === "create" && (
        <GoogleSheetsCreateDialog busy={busy === "create"} phase={createPhase} aiEnrich={aiEnrichChoice} onAiEnrich={setAiEnrichChoice} onClose={() => setDialog(null)} onCreate={() => void createSheet()} />
      )}

      {dialog === "success" && success && (
        <GoogleSheetsCreateSuccess count={success.count} url={success.url} onClose={() => { setSuccess(null); setDialog(null); }} />
      )}

      {dialog === "connect" && (
        <GoogleSheetsConnectDialog url={connectUrl} tab={connectTab} preview={connectPreview} busy={busy === "connect"} error={connectError} onUrl={(value) => setConnectUrl(value)} onTab={(value) => setConnectTab(value)} onVerify={() => void verifyConnect()} onConnect={() => void connectExisting()} onClose={() => setDialog(null)} />
      )}

      {dialog === "pause" && (
        <GoogleSheetsPauseDialog busy={busy === "pause"} resuming={!!connection && !connection.enabled} onClose={() => setDialog(null)} onConfirm={() => void togglePause()} />
      )}

      {dialog === "disconnect" && (
        <GoogleSheetsDisconnectDialog busy={busy === "disconnect"} onClose={() => setDialog(null)} onConfirm={() => void disconnectSheet()} />
      )}

      {dialog === "recover" && connection && (
        <GoogleSheetsRecoveryDialog connection={connection} busy={busy === "recover"} result={recoverResult} canCreate={canCreateNew} onClose={() => setDialog(null)} onRecover={() => void recoverConnection()} onCreate={() => setDialog("create")} />
      )}

      {dialog === "settings" && connection && (
        <GoogleSheetsSettings
          connection={connection}
          canManage={canManage}
          canSync={canSync}
          busy={busy}
          channel={channel}
          onClose={() => setDialog(null)}
          onPause={() => setDialog("pause")}
          onDisconnect={() => setDialog("disconnect")}
          onSync={() => void syncNow("settings")}
          onDeleteBehavior={(value) => void applyDeleteBehavior(value)}
          onAiEnrich={(value) => void applyAiEnrich(value)}
          onAiPrompts={(value, handlers) => void applyAiPrompts(value, handlers)}
        />
      )}

      {dialog === "history" && (
        <GoogleSheetsSyncHistory
          runs={runs}
          onClose={() => setDialog(null)}
          onSelect={(run) => { setSelectedRun(run); setDialog("changes"); }}
        />
      )}

      {dialog === "changes" && (selectedRun ?? latestRun) && (
        <GoogleSheetsSyncRunDetails run={(selectedRun ?? latestRun) as SyncRun} onClose={() => { setSelectedRun(null); if (runs.length) setDialog("history"); else setDialog(null); }} />
      )}

    </section>
  );
}
