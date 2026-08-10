"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { isLearningDraftFresh } from "@/lib/learningDraft";

const UserSessionContext = createContext<number | null>(null);
const LEGACY_DRAFT_PREFIXES = [
  "lexora-dictation-draft-",
  "lexora-sentence-draft-",
  "lexora-quiz-draft-",
  "lexora-match-draft-",
  "lexora-pronunciation-draft-",
];

export function UserSessionProvider({ userId, children }: { userId: number; children: ReactNode }) {
  useEffect(() => {
    try {
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (key && LEGACY_DRAFT_PREFIXES.some((prefix) => key.startsWith(prefix))) localStorage.removeItem(key);
        else if (key?.startsWith("lexora-learning-draft-")) {
          try {
            const draft = JSON.parse(localStorage.getItem(key) || "null") as { savedAt?: number } | null;
            if (!draft || !isLearningDraftFresh(Number(draft.savedAt))) localStorage.removeItem(key);
          } catch { localStorage.removeItem(key); }
        }
      }
    } catch { /* Storage is optional. */ }
  }, []);

  return <UserSessionContext.Provider value={userId}>{children}</UserSessionContext.Provider>;
}

export function useCurrentUserId() {
  const userId = useContext(UserSessionContext);
  if (userId === null) throw new Error("useCurrentUserId must be used inside UserSessionProvider");
  return userId;
}
