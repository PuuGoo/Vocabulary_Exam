"use client";
import { STATUS_LABEL, StatusView } from "./types";

/**
 * The persistent sync status. Automatic sync must be obvious at a glance, so
 * this never renders a bare backend state like "Lỗi".
 */
export default function GoogleSheetsStatusCard({ status, feedback }: { status: StatusView; feedback?: string }) {
  const meta = STATUS_LABEL[status] ?? STATUS_LABEL.disconnected;
  return (
    <div role="status" aria-live="polite" className={`text-sm font-semibold ${meta.className}`}>
      <span className="inline-flex items-center gap-2">
        <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
        {meta.label}
      </span>
      {feedback ? <p className="mt-1 text-xs font-normal text-muted">{feedback}</p> : null}
    </div>
  );
}