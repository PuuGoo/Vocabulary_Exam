"use client";

import { useEffect, useRef } from "react";

export function useVocabularySync(setId: number | undefined, vocabularyVisible: boolean, canSync: boolean, refresh: (setId: number) => Promise<void>) {
  const observedRef = useRef<{ setId: number; revision: string } | null>(null);

  useEffect(() => {
    if (!setId) return;
    const currentSetId = setId;
    let cancelled = false;
    let running = false;
    async function observe() {
      if (document.visibilityState === "hidden" || running) return;
      running = true;
      try {
        const response = await fetch(`/api/admin/google-sheets/connections?setId=${currentSetId}`, { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const data = await response.json();
        const connection = data.connections?.find((item: { setId: number }) => item.setId === currentSetId);
        if (cancelled || !connection) return;
        const revision = `${connection.id}:${connection.lastSyncedAt ?? ""}`;
        const previous = observedRef.current;
        if (!previous || previous.setId !== currentSetId || previous.revision !== revision) {
          await refresh(currentSetId);
          if (!cancelled) observedRef.current = { setId: currentSetId, revision };
        }
      } catch {
      } finally {
        running = false;
      }
    }
    void observe();
    const timer = window.setInterval(() => void observe(), 10000);
    const onReturn = () => void observe();
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [setId, vocabularyVisible, canSync, refresh]);
}
