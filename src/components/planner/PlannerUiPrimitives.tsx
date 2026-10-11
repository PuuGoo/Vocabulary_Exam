import type { ReactNode } from "react";

/**
 * Phase 7.3/7.5 — reusable planner interaction primitives: badge, progress,
 * skeleton, empty and error states. All reflect the Lexora shell, not a
 * generic CRUD look.
 */
export function PlannerBadge({ tone = "neutral", children }: { tone?: "neutral" | "success" | "warning" | "danger" | "info"; children: ReactNode }) {
  const tones: Record<string, string> = {
    neutral: "bg-slate-100 text-slate-700",
    success: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-800",
    danger: "bg-red-100 text-red-700",
    info: "bg-sky-100 text-sky-800",
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function PlannerProgress({ value, label }: { value: number; label?: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="flex items-center gap-2" aria-label={label}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${clamped}%` }} />
      </div>
      <span className="w-9 text-right text-xs font-medium text-slate-600">{clamped}%</span>
    </div>
  );
}

export function PlannerSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-busy="true" className="space-y-2">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-12 animate-pulse rounded-2xl bg-slate-100" />
      ))}
    </div>
  );
}

export function PlannerEmpty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
      <p className="font-semibold text-slate-800">{title}</p>
      <p className="mt-1">{body}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function PlannerError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <p>{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="mt-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-red-700 shadow hover:bg-red-100">
          Thử lại
        </button>
      ) : null}
    </div>
  );
}

export function PlannerDeleteConfirm({
  title,
  body,
  confirmLabel = "Xác nhận xoá",
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[70] grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-slate-600">{body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-xl bg-slate-100 px-4 py-2 text-sm">Huỷ</button>
          <button type="button" onClick={onConfirm} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white">{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export function PlannerConflictRow({
  detail,
  onChoose,
}: {
  detail: { lexoraId: string; label: string; fieldsChanged: string[]; sheet: Record<string, string>; db: Record<string, string> };
  onChoose: (choice: "sheet" | "website") => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-medium">{detail.label}</p>
      <p className="mt-1 text-xs text-slate-500">{detail.lexoraId} · {detail.fieldsChanged.join(", ")}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl bg-slate-50 p-3 text-xs"><p className="font-semibold">Giá trị trong Sheet</p><pre className="mt-1 whitespace-pre-wrap break-words text-slate-700">{JSON.stringify(detail.sheet, null, 2)}</pre></div>
        <div className="rounded-xl bg-amber-50 p-3 text-xs"><p className="font-semibold">Giá trị trên web</p><pre className="mt-1 whitespace-pre-wrap break-words text-slate-700">{JSON.stringify(detail.db, null, 2)}</pre></div>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => onChoose("sheet")} className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white">Dùng giá trị Sheet</button>
        <button type="button" onClick={() => onChoose("website")} className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200">Giữ giá trị web</button>
      </div>
    </div>
  );
}

export function PlannerBulkReviewBanner({ fingerprint, onApprove }: { fingerprint: string; onApprove: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-semibold">Thay đổi lớn: cần phê duyệt</p>
      <p className="mt-1 text-xs text-amber-800">Mã xác nhận: <code className="rounded bg-white px-1 py-0.5 text-xs">{fingerprint.slice(0, 12)}</code> — hãy xem danh sách, rồi bấm phê duyệt để áp dụng hàng loạt.</p>
      <button type="button" onClick={onApprove} className="mt-3 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white">Phê duyệt thay đổi lớn</button>
    </div>
  );
}

