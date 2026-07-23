"use client";

import { useEffect, useState } from "react";
import { toast } from "@/components/Toast";

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);
    let wasOffline = !navigator.onLine;
    function handleOffline() {
      wasOffline = true;
      setOffline(true);
    }
    function handleOnline() {
      setOffline(false);
      if (wasOffline) toast("Đã kết nối lại. Bạn có thể tiếp tục học.");
      wasOffline = false;
    }
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  if (!offline) return null;
  return <div className="fixed inset-x-0 top-[72px] z-[45] flex items-center justify-center gap-3 border-b border-[#F0DDA2] bg-[#FFF9E7] px-4 py-2.5 text-center text-xs font-semibold text-[#72591A] shadow-sm" role="status" aria-live="polite">
    <span><span aria-hidden="true">⚠️ </span>Không có kết nối mạng. Một số dữ liệu chưa thể tải hoặc lưu.</span>
    <button type="button" className="shrink-0 rounded-[9px] border border-[#D8BD72] px-2.5 py-1.5 text-xs font-bold text-[#72591A] transition hover:bg-[#F7EECF]" onClick={() => navigator.onLine ? window.location.reload() : toast("Thiết bị vẫn chưa có kết nối mạng.")}>Thử lại</button>
  </div>;
}
