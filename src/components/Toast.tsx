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
      timer = setTimeout(() => setMessage(null), 2500);
    }
    window.addEventListener("ivc-toast", onToast);
    return () => {
      window.removeEventListener("ivc-toast", onToast);
      clearTimeout(timer);
    };
  }, []);

  if (!message) return null;

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-ink text-white px-5 py-2.5 rounded-lg text-sm z-50 shadow-lg">
      {message}
    </div>
  );
}
