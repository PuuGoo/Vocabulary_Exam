"use client";

import { useState } from "react";
import Link from "next/link";
import MyWordsPage from "@/app/(student)/my-words/page";
import StudyPage from "@/app/(student)/study/page";

type LibrarySection = "vault" | "sets";

export default function LibraryHubPage() {
  const [section, setSection] = useState<LibrarySection>("vault");

  return (
    <div className="lexora-page-enter space-y-6">
      <header className="lexora-bento relative overflow-hidden p-5 sm:p-7">
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-gold/10 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-gold/25 bg-goldpale px-3 py-1 text-[0.7rem] font-extrabold uppercase tracking-[0.15em] text-golddark">
              <span className="h-1.5 w-1.5 rounded-full bg-gold" />
              Explore &amp; Library · Personal Knowledge Vault
            </div>
            <h1 className="mt-3 font-serif text-[clamp(1.75rem,3.4vw,2.45rem)] font-extrabold tracking-[-0.03em] text-ink">
              Thư viện cá nhân &amp; Kho bộ từ
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted">
              Tra cứu từ điển nhanh, quản lý Sổ tay từ khó (Vault), các từ cần khắc phục và toàn bộ bộ từ IELTS / HSK đồng bộ Google Sheets.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex rounded-[14px] border border-line bg-paper p-1 shadow-inner">
              <button
                type="button"
                onClick={() => setSection("vault")}
                className={`lexora-pill-tab ${
                  section === "vault"
                    ? "bg-gold text-white shadow-[0_6px_16px_-4px_rgb(var(--color-gold)/0.45)]"
                    : "text-muted hover:text-ink"
                }`}
              >
                <span>📚</span>
                <span>Sổ tay &amp; Từ điển (Vault)</span>
              </button>
              <button
                type="button"
                onClick={() => setSection("sets")}
                className={`lexora-pill-tab ${
                  section === "sets"
                    ? "bg-gold text-white shadow-[0_6px_16px_-4px_rgb(var(--color-gold)/0.45)]"
                    : "text-muted hover:text-ink"
                }`}
              >
                <span>🗂️</span>
                <span>Kho bộ từ (Decks)</span>
              </button>
            </div>
            <Link
              href="/study-planner"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-[12px] border border-line bg-panel px-3.5 py-2 text-xs font-extrabold text-ink transition hover:border-gold/40 hover:text-golddark"
            >
              <span>🔄</span>
              <span>Google Sheets Sync</span>
            </Link>
          </div>
        </div>
      </header>

      {section === "vault" ? <MyWordsPage /> : <StudyPage />}
    </div>
  );
}
