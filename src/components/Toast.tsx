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
      className="lexora-toast fixed left-1/2 z-[70] flex max-w-[90vw] -translate-x-1/2 items-center gap-3 rounded-[14px] bg-ink px-4 py-3 text-sm text-white shadow-[0_8px_28px_rgba(36,35,55,0.18)] backdrop-blur-sm md:max-w-md"
    >
      <span className="text-left whitespace-pre-line">{message}</span>
      <button
        type="button"
        aria-label="Đóng thông báo"
        className="shrink-0 ml-1 flex h-7 w-7 items-center justify-center rounded-full text-sm leading-none text-white/60 transition hover:bg-white/15 hover:text-white focus:outline focus:outline-2 focus:outline-gold"
        onClick={() => setMessage(null)}
      >
        ×
      </button>
    </div>
  );
}

