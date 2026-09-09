"use client";

import { getLanguageConfig } from "@/lib/languages";

export default function SpeakButton({ text, languageCode = "en", speechLanguage, className = "" }: { text: string; languageCode?: string; speechLanguage?: string; className?: string }) {
  function speak(e: React.MouseEvent) {
    e.stopPropagation();
    if (!text) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const cleanText = languageCode === "en" ? text.split("/")[0].trim() : text.trim();
    const utter = new SpeechSynthesisUtterance(cleanText);
    utter.lang = speechLanguage || getLanguageConfig(languageCode).ttsLanguage;
    utter.rate = 0.9;
    window.speechSynthesis.speak(utter);
  }

  return (
    <button
      type="button"
      onClick={speak}
      title="Nghe phát âm"
      aria-label="Nghe phát âm"
      className={`inline-flex min-h-10 min-w-10 items-center justify-center rounded-full border border-line bg-white text-[0.85rem] transition-colors hover:border-gold hover:text-golddark shrink-0 ${className}`}
    >
      🔊
    </button>
  );
}
