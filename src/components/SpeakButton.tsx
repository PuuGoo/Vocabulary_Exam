"use client";

export default function SpeakButton({ text, className = "" }: { text: string; className?: string }) {
  function speak(e: React.MouseEvent) {
    e.stopPropagation();
    if (!text) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const cleanText = text.split("/")[0].trim(); // if "burned/burnt", just read the first form
    const utter = new SpeechSynthesisUtterance(cleanText);
    utter.lang = "en-US";
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
