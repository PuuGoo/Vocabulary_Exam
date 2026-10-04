import React from "react";
import { cx } from "@/components/ui";

export default function GoogleSheetCardLink({ url, setName, onSetup, loading = false, disabled = false }: { url?: string | null; setName: string; onSetup: () => void; loading?: boolean; disabled?: boolean }) {
  if (!url) return <button type="button" onClick={onSetup} disabled={disabled || loading} aria-busy={loading} className={`${cx.btn} border border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200`} title="Mở cài đặt để tạo hoặc kết nối Google Sheet" aria-label={`Mở cài đặt Google Sheet cho ${setName}`}>{loading ? "Đang mở..." : "Google Sheet"}</button>;
  return <a href={url} target="_blank" rel="noopener noreferrer" className={`${cx.btn} inline-flex items-center gap-1.5 border border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-400 hover:bg-emerald-100`} title="Mở Google Sheet trong tab mới" aria-label={`Mở Google Sheet của ${setName} trong tab mới`}>Google Sheet <span aria-hidden="true">↗</span></a>;
}
