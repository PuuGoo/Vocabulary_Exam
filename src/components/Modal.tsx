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
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  closeOnBackdrop?: boolean;
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
      className="lexora-modal-backdrop fixed inset-0 bg-ink/50 z-50 flex items-center justify-center p-4"
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
        className={`lexora-modal-panel bg-white text-ink rounded-[10px] w-full shadow-lg flex max-h-[92vh] flex-col ${wide ? "max-w-6xl" : "max-w-2xl"}`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-4">
          <h3 id={titleId} className="font-serif text-[1.05rem]">{title}</h3>
          <button type="button" onClick={() => onCloseRef.current()} className="text-muted hover:text-ink text-xl leading-none px-1" aria-label="Đóng">
            ×
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  ), document.body);
}
