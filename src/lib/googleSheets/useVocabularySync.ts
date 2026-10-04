"use client";

import { useEffect, useRef } from "react";
import { toast } from "@/components/Toast";

export function useVocabularySync(setId: number | undefined, vocabularyVisible: boolean, canSync: boolean, refresh: (setId: number) => Promise<void>) {
  const requestRef = useRef({ running: false, lastSetId: 0, lastAttempt: 0 });
  const visibleSetRef = useRef(setId);
  const errorRef = useRef("");
  visibleSetRef.current = setId;

  useEffect(() => {
    if (!setId) return;
    const currentSetId = setId;
    async function reconcile() {
      if (document.visibilityState === "hidden" || requestRef.current.running) return;
      const request = requestRef.current;
      request.running = true;
      try {
        if (canSync && (request.lastSetId !== currentSetId || Date.now() - request.lastAttempt >= 30000)) {
          request.lastSetId = currentSetId;
          request.lastAttempt = Date.now();
          const response = await fetch(`/api/admin/google-sheets/connections?setId=${currentSetId}`, { cache: "no-store" });
          if (response.ok && visibleSetRef.current === currentSetId) {
            const data = await response.json();
            const connection = data.connections?.find((item: { setId: number; enabled: boolean; status: string }) => item.setId === currentSetId && item.enabled && item.status !== "disconnected" && item.status !== "paused");
            if (connection) {
              const result = await fetch(`/api/admin/google-sheets/connections/${connection.id}/sync`, { method: "POST" });
              if (!result.ok && result.status !== 409) {
                const failure = await result.json().catch(() => ({}));
                throw new Error(failure.error || "Google Sheets sync failed.");
              }
              if (result.ok) errorRef.current = "";
            }
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Google Sheets sync failed.";
        if (visibleSetRef.current === currentSetId && errorRef.current !== message) toast(message);
        errorRef.current = message;
      } finally {
        try {
          if (visibleSetRef.current === currentSetId) await refresh(currentSetId);
        } finally {
          request.running = false;
        }
      }
    }
    void reconcile();
    const timer = window.setInterval(() => void reconcile(), 30000);
    const onReturn = () => void reconcile();
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [setId, vocabularyVisible, canSync, refresh]);
}
