"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Health = { missing: boolean; accessDenied: boolean; accessible: boolean; message?: string; oauthRevoked?: boolean };
type Payload = {
  connected: boolean;
  connection?: { status: string; enabled: boolean; spreadsheetId: string; spreadsheetUrl: string; lastError: string | null };
  channel?: { expirationAt: string | null } | null;
  health?: Health | null;
};

/**
 * Phase 11 — Planner connection panel.
 *
 * Shows health, offers the exact recovery action for the state at hand
 * (reconnect / refresh watch / disconnect), and never offers a destructive
 * file action for a planner the owner has not confirmed.
 */
export default function PlannerConnectionPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/study-planner/recover", { cache: "no-store" });
      if (!response.ok) throw new Error("Không tải được trạng thái kết nối.");
      setData(await response.json());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Không tải được trạng thái kết nối.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function act(action: "disconnect" | "replace") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/study-planner/recover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          action === "replace"
            ? { action, confirmedSpreadsheetId: data?.connection?.spreadsheetId }
            : { action },
        ),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Thao tác thất bại.");
      setNotice(
        action === "disconnect"
          ? "Đã ngắt đồng bộ. File Google Sheet và dữ liệu web vẫn được giữ nguyên."
          : "Đã làm mới kết nối và watch channel.",
      );
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Thao tác thất bại.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Đang kiểm tra kết nối Study Planner…</div>;
  }
  if (!data?.connected) return null;

  const health = data.health;
  const needsReconnect = Boolean(health?.oauthRevoked || health?.accessDenied);
  const missing = Boolean(health?.missing);

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Kết nối Study Planner</h2>
        <span className={`rounded-full px-2 py-1 text-xs ${data.connection?.status === "connected" && !needsReconnect && !missing ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
          {needsReconnect ? "Cần kết nối lại" : missing ? "Không tìm thấy Sheet" : data.connection?.status}
        </span>
      </div>
      {health?.message ? <p role="status" className="text-sm text-amber-800">{health.message}</p> : null}
      {data.connection?.lastError ? <p role="alert" className="text-sm text-red-700">{data.connection.lastError}</p> : null}
      <div className="flex flex-wrap gap-2">
        <a
          href={data.connection?.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${encodeURIComponent(data.connection?.spreadsheetId ?? "")}/edit`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl bg-slate-100 px-3 py-2 text-sm hover:bg-slate-200"
        >
          Mở Google Sheet
        </a>
        {needsReconnect ? (
          <a href="/api/study-planner/oauth" className="rounded-xl bg-gold px-3 py-2 text-sm font-semibold text-white">Kết nối lại Google</a>
        ) : (
          <button type="button" disabled={busy} onClick={() => void act("replace")} className="rounded-xl bg-slate-100 px-3 py-2 text-sm hover:bg-slate-200 disabled:opacity-50">
            {busy ? "Đang xử lý…" : "Làm mới kết nối"}
          </button>
        )}
        {data.connection?.enabled ? (
          <button type="button" disabled={busy} onClick={() => void act("disconnect")} className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            Ngắt đồng bộ
          </button>
        ) : (
          <Link href="/study-planner" className="rounded-xl bg-slate-100 px-3 py-2 text-sm">Về trang tổng quan</Link>
        )}
      </div>
      <p className="text-xs text-slate-500">
        Ngắt đồng bộ không xoá file hay dữ liệu. Nếu bạn xoá Google Sheet, dữ liệu web vẫn được giữ để phục hồi.
      </p>
      {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    </section>
  );
}
