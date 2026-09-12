"use client";

import { useEffect, useRef, useState } from "react";
import { LEARNING_MODE_META, type LearningMode } from "@/lib/learningModes";
import { shouldToggleLearningDock } from "@/lib/learningDock";

export default function LearningQuickDock({ availableModes, currentMode, onSelect, guest = false }: { availableModes: readonly string[]; currentMode?: string; onSelect: (mode: string) => void; guest?: boolean }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat) return;
      if (shouldToggleLearningDock({ ...event, target: event.target as HTMLElement | null })) { event.preventDefault(); setOpen((value) => !value); }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const modes = availableModes.filter((mode) => LEARNING_MODE_META[mode as LearningMode]);
  return <div className="fixed right-4 top-[max(16px,env(safe-area-inset-top))] z-[91]">
    <button ref={buttonRef} type="button" aria-label="Mở menu chế độ học" aria-haspopup="menu" aria-expanded={open} aria-keyshortcuts="M ." title="Mở chế độ học (M hoặc dấu chấm)" onClick={() => setOpen((value) => !value)} className="flashcard-dock-trigger"><span aria-hidden="true">⚡</span><kbd className="hidden rounded border bg-white px-1.5 py-0.5 text-[0.65rem] sm:inline">M</kbd></button>
    {open && <button type="button" aria-label="Đóng menu chế độ học" className="fixed inset-0 z-[-1] cursor-default" onClick={() => setOpen(false)} />}
    {open && <div role="menu" aria-label="Chuyển chế độ học" className="flashcard-dock-panel fixed right-0 top-14 max-h-[calc(100dvh-90px)] w-[min(21rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-[#EBEAF2] bg-white p-3 shadow-xl">
      {modes.map((mode) => <button type="button" role="menuitem" key={mode} aria-current={currentMode === mode ? "page" : undefined} className={`flex min-h-11 w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-[#F0EDFF] ${currentMode === mode ? "bg-[#F0EDFF] text-ink" : "text-muted"}`} onClick={() => { onSelect(mode); setOpen(false); }}>{LEARNING_MODE_META[mode as LearningMode].label}{currentMode === mode && <span aria-hidden="true">✓</span>}</button>)}
      {guest && <p className="mt-2 border-t border-line pt-2 text-[0.68rem] text-muted">Bạn đang học với tư cách khách.</p>}
    </div>}
  </div>;
}
