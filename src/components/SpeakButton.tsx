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
      className={`inline-flex items-center justify-center w-6 h-6 rounded-full border border-line bg-white hover:border-gold hover:text-golddark text-[0.8rem] shrink-0 ${className}`}
    >
      🔊
    </button>
  );
}
