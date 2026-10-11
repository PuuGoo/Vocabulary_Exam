"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Phase 7.4 — shared sync state indicator.
 *
 * Shows exactly one of the six states below plus the last successful sync
 * time. It only *reads* the connection endpoint — it never triggers a sync;
 * "Sync now" is available as a secondary manual recovery action, never the
 * primary workflow.
 */
type State = "auto" | "syncing" | "synced" | "delayed" | "error" | "reconnect";
const LABELS: Record<State, string> = {
  auto: "Đang tự động đồng bộ",
  syncing: "Đang đồng bộ…",
  synced: "Đã đồng bộ",
  delayed: "Đồng bộ bị chậm",
  error: "Có lỗi đồng bộ",
  reconnect: "Cần kết nối lại Google",
};
const TONES: Record<State, string> = {
  auto: "bg-slate-100 text-slate-700",
  syncing: "bg-blue-100 text-blue-800",
  synced: "bg-emerald-100 text-emerald-700",
  delayed: "bg-amber-100 text-amber-800",
  error: "bg-red-100 text-red-700",
  reconnect: "bg-amber-200 text-amber-900",
};

function classify(payload: {
  status?: string;
  pending?: { pending?: boolean } | null;
  lastSyncedAt?: string | null;
  lastSuccessfulSyncedAt?: string | null;
  lastError?: string | null;
}): State {
  if (payload.lastError) return "error";
  if (payload.status === "error" || payload.status === "disconnected") return "reconnect";
  if (payload.pending?.pending) return "syncing";
  if (!payload.lastSuccessfulSyncedAt) return "auto";
  const age = Date.now() - new Date(payload.lastSuccessfulSyncedAt).getTime();
  return age > 30 * 60 * 1000 ? "delayed" : "synced";
}

export default function PlannerSyncIndicator({ refreshMs = 20000 }: { refreshMs?: number }) {
  const [state, setState] = useState<State>("auto");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/study-planner/connection", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json();
      setState(classify(payload));
      setLastSyncedAt(payload.lastSuccessfulSyncedAt ?? payload.lastSyncedAt ?? null);
    } catch {
      // Read-only indicator: a transient failure keeps the previous state.
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), Math.max(8000, refreshMs));
    return () => window.clearInterval(id);
  }, [load, refreshMs]);

  async function manualSync() {
    setBusy(true);
    try {
      await fetch("/api/study-planner/sync", { method: "POST" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  const when = lastSyncedAt
    ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(lastSyncedAt))
    : null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" role="status" aria-live="polite">
      <span className={`rounded-full px-3 py-1 font-medium ${TONES[state]}`}>{LABELS[state]}</span>
      {when ? <span className="text-slate-500">Lần cuối: {when}</span> : null}
      <button
        type="button"
        onClick={() => void manualSync()}
        disabled={busy}
        className="rounded-full border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        title="Đồng bộ thủ công (không bắt buộc — hệ thống tự đồng bộ)"
      >
        {busy ? "Đang chạy…" : "Đồng bộ ngay"}
      </button>
    </div>
  );
}
