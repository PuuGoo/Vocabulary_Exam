"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export default function InstallAppPrompt() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true) return;
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      const nextEvent = event as InstallPromptEvent;
      setPromptEvent(nextEvent);
      setVisible(localStorage.getItem("lexora_install_dismissed") !== "1");
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  if (!visible || !promptEvent) return null;

  async function install() {
    const event = promptEvent;
    if (!event) return;
    await event.prompt();
    setVisible(false);
    void event.userChoice;
  }

  function dismiss() {
    localStorage.setItem("lexora_install_dismissed", "1");
    setVisible(false);
  }

  return <aside className="fixed inset-x-3 bottom-[5.75rem] z-[60] mx-auto flex max-w-md items-center gap-3 rounded-[18px] border border-line bg-white p-3 shadow-[0_16px_45px_rgba(36,35,55,.18)] md:hidden" aria-label="Cài Lexora như ứng dụng"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] bg-[#7865EE] text-lg font-extrabold text-white">L</span><div className="min-w-0 flex-1"><b className="block text-sm text-ink">Học tiện hơn trên điện thoại</b><span className="block text-xs leading-5 text-muted">Thêm Lexora vào màn hình chính để mở nhanh.</span></div><button type="button" onClick={() => void install()} className="shrink-0 rounded-[10px] bg-gold px-3 py-2 text-xs font-bold text-white">Cài app</button><button type="button" onClick={dismiss} className="self-start p-1 text-lg leading-none text-muted" aria-label="Đóng">×</button></aside>;
}
