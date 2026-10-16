"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

const modalStack: symbol[] = [];
let bodyOverflowBeforeModals = "";

export default function Modal({
  title,
  onClose,
  children,
  wide = false,
  closeOnBackdrop = true,
  fillViewport = false,
  bodyClassName = "overflow-y-auto p-5",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  closeOnBackdrop?: boolean;
  fillViewport?: boolean;
  bodyClassName?: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const tokenRef = useRef(Symbol("modal"));

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const token = tokenRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    if (modalStack.length === 0) bodyOverflowBeforeModals = document.body.style.overflow;
    modalStack.push(token);
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel || panel.contains(document.activeElement)) return;
      const initial = panel.querySelector<HTMLElement>("[autofocus]") || panel.querySelector<HTMLElement>("input, select, textarea, button, a[href]");
      (initial || panel).focus();
    }, 0);

    function onKeyDown(e: KeyboardEvent) {
      if (modalStack[modalStack.length - 1] !== token) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) {
        e.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
      const index = modalStack.lastIndexOf(token);
      if (index >= 0) modalStack.splice(index, 1);
      if (modalStack.length === 0) document.body.style.overflow = bodyOverflowBeforeModals;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal((
    <div
      className="lexora-modal-backdrop fixed inset-0 bg-ink/45 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-5"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onCloseRef.current();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`lexora-modal-panel border border-line bg-panel text-ink rounded-[24px] w-full shadow-[0_28px_80px_-12px_rgba(15,23,42,0.28)] flex max-h-[calc(100dvh-1.5rem)] flex-col sm:max-h-[calc(100dvh-2.5rem)] ${fillViewport ? "h-[calc(100dvh-1rem)] sm:h-[calc(100dvh-2rem)]" : ""} ${wide ? fillViewport ? "max-w-[min(98vw,100rem)]" : "max-w-6xl" : "max-w-2xl"}`}
      >
        <div className={`flex shrink-0 items-center justify-between border-b border-line ${fillViewport ? "px-4 py-2.5" : "px-5 py-4"}`}>
          <h3 id={titleId} className="font-serif text-[1.1rem] font-extrabold tracking-[-0.02em]">{title}</h3>
          <button type="button" onClick={() => onCloseRef.current()} className="flex h-8 w-8 items-center justify-center rounded-full border border-line/80 bg-paper/60 text-muted transition hover:border-gold/40 hover:text-ink text-lg leading-none" aria-label="Đóng">
            ×
          </button>
        </div>
        <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
      </div>
    </div>
  ), document.body);
}
