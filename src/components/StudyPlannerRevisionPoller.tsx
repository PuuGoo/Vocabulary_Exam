"use client";

import { useEffect, useRef } from "react";

/**
 * Phase 8 — Lightweight observer for planner updates.
 *
 * Polls GET /api/study-planner/connection every few seconds while the tab is
 * visible, and only compares the revision/status. It never triggers a sync,
 * never POSTs to a sync endpoint, and never refetches heavy domain data when
 * nothing changed: the webhook and the reconcile cron — not the browser —
 * perform synchronization.
 *
 * When the revision advances, the page revalidates itself through a soft
 * navigation refresh so affected queries (Dashboard KPIs, lists, charts) all
 * observe the same new revision.
 */
export default function StudyPlannerRevisionPoller({ intervalMs = 8000 }: { intervalMs?: number }) {
  const lastRevision = useRef<number | null>(null);
  const lastStatus = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let notified = false;

    async function check() {
      if (document.visibilityState !== "visible" || cancelled) return;
      try {
        const response = await fetch("/api/study-planner/connection", { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const data = await response.json();
        const revision = typeof data.revision?.revision === "number" ? data.revision.revision : null;
        const status = typeof data.status === "string" ? data.status : null;
        if (lastRevision.current == null && revision != null) {
          lastRevision.current = revision;
          lastStatus.current = status;
          return;
        }
        if (revision != null && lastRevision.current != null && revision !== lastRevision.current) {
          lastRevision.current = revision;
          lastStatus.current = status;
          window.dispatchEvent(new CustomEvent("study-planner:updated", { detail: { revision } }));
          return;
        }
        if (status != null && lastStatus.current != null && status !== lastStatus.current) {
          lastStatus.current = status;
          window.dispatchEvent(new CustomEvent("study-planner:updated", { detail: { status } }));
        }
      } catch {
        // Transient failure: keep the old revision and try again next tick.
      }
    }

    async function notifyOnce() {
      if (notified || cancelled) return;
      notified = true;
      try {
        const toast = (window as unknown as { lexoraToast?: (message: string) => void }).lexoraToast;
        toast?.("Đã cập nhật từ Google Sheets");
      } catch { /* notification is best-effort */ }
      window.location.reload();
    }

    function onUpdated() {
      void notifyOnce();
    }

    const id = window.setInterval(() => void check(), Math.max(4000, intervalMs));
    window.addEventListener("study-planner:updated", onUpdated);
    void check();
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("study-planner:updated", onUpdated);
    };
  }, [intervalMs]);

  return null;
}
