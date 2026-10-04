"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function StudyPlannerBootstrap() {
  useEffect(() => {
    let cancelled = false;
    async function ensure() {
      try {
        const response = await fetch("/api/study-planner", { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const data = await response.json();
        if (!data.planner && data.googleConnected && !cancelled) {
          const created = await fetch("/api/study-planner", { method: "POST" });
          if (created.ok) window.dispatchEvent(new Event("study-planner-ready"));
        }
      } catch { }
    }
    void ensure();
    return () => { cancelled = true; };
  }, []);
  return null;
}

export default function StudyPlannerCard({ setup = false }: { setup?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/study-planner", { cache: "no-store" });
        if (!response.ok) throw new Error("Không tải được Study Planner. Hãy tải lại trang.");
        const data = await response.json();
        if (active) { setUrl(data.planner?.url ?? null); setConnected(data.googleConnected); setError(""); }
      } catch (failure) { if (active) setError(failure instanceof Error ? failure.message : "Không tải được Planner."); }
      finally { if (active) setLoading(false); }
    };
    void load();
    window.addEventListener("study-planner-ready", load);
    return () => { active = false; window.removeEventListener("study-planner-ready", load); };
  }, []);
  async function create() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/study-planner", { method: "POST" });
      const data = await response.json();
      if (!response.ok) { if (data.oauthRequired) setConnected(false); throw new Error(data.error || "Không tạo được Planner."); }
      setUrl(data.planner.url);
      window.dispatchEvent(new Event("study-planner-ready"));
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Không tạo được Planner."); }
    finally { setBusy(false); }
  }
  const classes = `lexora-card flex items-center gap-3 p-4 transition hover:-translate-y-0.5 ${url ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-400" : "bg-slate-100 text-slate-600 hover:border-slate-300"}`;
  const content = <><span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-white/70 text-lg">▦</span><span><b className="block text-sm">Study Planner {url ? "↗" : ""}</b><span className="mt-1 block text-xs">{loading ? "Đang kiểm tra..." : url ? "Mở kế hoạch học của bạn" : "Kết nối Google và tạo bản riêng"}</span></span></>;
  return <div className={setup ? "space-y-4" : ""}>
    {url ? <a href={url} target="_blank" rel="noopener noreferrer" className={classes}>{content}</a> : <Link href="/study-planner" className={classes}>{content}</Link>}
    {setup && <>
      <p className="text-sm text-muted">Bản sao riêng nằm trong Google Drive của bạn. Mỗi tài khoản Lexora dùng lại một Planner; đăng nhập lại không tạo thêm và không ghi đè nội dung đã sửa.</p>
      {!url && !loading && (connected ? <button type="button" disabled={busy} onClick={() => void create()} className="rounded-xl bg-gold px-4 py-3 font-bold text-white disabled:opacity-50">{busy ? "Đang tạo bản sao..." : "Tạo Study Planner từ mẫu"}</button> : <a href="/api/study-planner/oauth" className="inline-block rounded-xl bg-gold px-4 py-3 font-bold text-white">Kết nối Google của tôi</a>)}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <p className="text-xs text-muted">Tài khoản Google cần có quyền xem và sao chép Sheet mẫu. Nếu Google từ chối truy cập mẫu, hãy nhờ chủ mẫu chia sẻ quyền; ứng dụng không tự công khai Planner của bạn.</p>
      <p className="text-xs text-muted">Để đọc mẫu cố định mà không cần chọn qua Google Picker, kết nối Planner yêu cầu thêm quyền chỉ đọc Google Drive (quyền này rộng hơn một file). Ứng dụng chỉ dùng để tìm bản Planner riêng và sao chép mẫu. Bạn sẽ thấy và xác nhận quyền trong màn hình Google.</p>
    </>}
  </div>;
}
