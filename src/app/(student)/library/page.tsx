"use client";

import { useState } from "react";
import MyWordsPage from "@/app/(student)/my-words/page";
import StudyPage from "@/app/(student)/study/page";

type LibrarySection = "vault" | "sets";

export default function LibraryHubPage() {
  const [section, setSection] = useState<LibrarySection>("vault");

  return (
    <div className="space-y-6">
      <header className="lexora-surface flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5">
        <div>
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-gold">
            Explore &amp; Library · B2C Personal Hub
          </span>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
            Thư viện cá nhân &amp; Sổ tay từ vựng
          </h1>
          <p className="mt-1 text-xs text-muted">
            Quản lý tập trung Bộ từ (Sets), Sổ tay từ khó (Vault), Từ điển tra cứu nhanh và đồng bộ Google Sheets.
          </p>
        </div>
        <div className="inline-flex rounded-xl border border-line bg-paper p-1">
          <button
            type="button"
            onClick={() => setSection("vault")}
            className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
              section === "vault" ? "bg-gold text-white shadow-xs" : "text-muted hover:text-ink"
            }`}
          >
            📚 Sổ tay &amp; Từ điển (Vault)
          </button>
          <button
            type="button"
            onClick={() => setSection("sets")}
            className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
              section === "sets" ? "bg-gold text-white shadow-xs" : "text-muted hover:text-ink"
            }`}
          >
            🗂️ Kho bộ từ (Sets)
          </button>
        </div>
      </header>

      {section === "vault" ? <MyWordsPage /> : <StudyPage />}
    </div>
  );
}
