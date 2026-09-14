"use client";

import { useRef, useState } from "react";
import Modal from "@/components/Modal";

export type ConfirmOptions = {
  title: string;
  description: string;
  confirmLabel: string;
  tone?: "danger" | "warning";
};

export default function ConfirmDialog({
  open,
  options,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  options: ConfirmOptions | null;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open || !options) return null;
  const danger = options.tone !== "warning";
  return (
    <Modal title={options.title} onClose={() => !busy && onCancel()}>
      <div className="mb-5 rounded-[12px] border border-line/60 bg-[#FBFAFE] px-4 py-3 text-sm leading-6 text-muted">{options.description}</div>
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="min-h-12 rounded-[12px] border border-line px-5 py-2.5 text-[0.85rem] font-semibold text-ink transition hover:border-gold hover:bg-goldpale/20"
        >
          Hủy
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className={`min-h-12 rounded-[12px] px-5 py-2.5 text-[0.85rem] font-semibold text-white shadow-[0_6px_16px_rgba(120,101,238,0.18)] transition hover:-translate-y-0.5 ${danger ? "bg-bad hover:bg-[#B23B4C]" : "bg-gold hover:bg-golddark"}`}
        >
          {busy ? "Đang xử lý..." : options.confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/** Promise adapter for existing async action handlers, backed by the shared accessible modal. */
export function useConfirmDialog() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((confirmed: boolean) => void) | null>(null);

  function confirm(next: ConfirmOptions) {
    resolver.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }

  function settle(confirmed: boolean) {
    resolver.current?.(confirmed);
    resolver.current = null;
    setOptions(null);
  }

  return {
    confirm,
    dialog: <ConfirmDialog open={Boolean(options)} options={options} onConfirm={() => settle(true)} onCancel={() => settle(false)} />,
  };
}
