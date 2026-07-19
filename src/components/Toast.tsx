"use client";

import { useEffect, useState } from "react";

type ToastEventDetail = { message: string };

export function toast(message: string) {
  window.dispatchEvent(new CustomEvent<ToastEventDetail>("ivc-toast", { detail: { message } }));
}

export default function ToastHost() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function onToast(e: Event) {
      const detail = (e as CustomEvent<ToastEventDetail>).detail;
      setMessage(detail.message);
      clearTimeout(timer);
      const duration = Math.min(8000, Math.max(2500, detail.message.length * 60));
      timer = setTimeout(() => setMessage(null), duration);
    }
    window.addEventListener("ivc-toast", onToast);
    return () => {
      window.removeEventListener("ivc-toast", onToast);
      clearTimeout(timer);
    };
  }, []);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{ bottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      className="fixed left-1/2 z-[70] flex max-w-[90vw] -translate-x-1/2 items-center gap-3 rounded-lg bg-ink px-4 py-2.5 text-sm text-white shadow-lg md:max-w-md"
    >
      <span className="text-left whitespace-pre-line">{message}</span>
      <button
        type="button"
        aria-label="Đóng thông báo"
        className="shrink-0 rounded px-1 text-lg leading-none text-white/70 hover:text-white focus:outline focus:outline-2 focus:outline-gold"
        onClick={() => setMessage(null)}
      >
        ×
      </button>
    </div>
  );
}
