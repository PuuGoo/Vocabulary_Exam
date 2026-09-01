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
      <p className="mb-5 text-sm leading-6 text-muted">{options.description}</p>
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="min-h-11 rounded-[11px] border border-line px-4 py-2.5 text-[0.85rem] font-semibold text-ink hover:border-gold"
        >
          Hủy
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className={`min-h-11 rounded-[11px] px-4 py-2.5 text-[0.85rem] font-semibold text-white transition hover:-translate-y-0.5 ${danger ? "bg-bad hover:bg-[#B23B4C]" : "bg-gold hover:bg-golddark"}`}
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
