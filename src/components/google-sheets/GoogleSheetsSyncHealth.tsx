"use client";
import { Connection, secondary, statusView } from "./types";

export default function GoogleSheetsSyncHealth({ connection, canManage, busy, onRecover }: { connection: Connection; canManage: boolean; busy: boolean; onRecover: () => void }) {
  const view = statusView(connection);
  const expired = !!connection.channelExpiresAt && new Date(connection.channelExpiresAt).getTime() <= Date.now();
  const problem = view === "error" || (connection.enabled && expired);
  const inactive = view === "paused" || view === "disconnected";
  const variant = problem ? "bg-amber-50 text-amber-800" : inactive ? "bg-gray-50 text-gray-600" : "bg-emerald-50 text-emerald-800";
  return (
    <div className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl p-4 ${variant}`}>
      <div>
        <p className="text-sm font-semibold">{problem ? "⚠ Đồng bộ đang gặp vấn đề" : inactive ? "Đồng bộ tự động chưa hoạt động" : "✓ Đồng bộ bình thường"}</p>
        <p className="mt-1 text-xs leading-5">{problem ? "Lexora chưa nhận được thay đổi mới từ Google Sheet." : inactive ? "Dữ liệu của bạn vẫn được giữ nguyên." : "Google Sheet và Lexora đang hoạt động."}</p>
      </div>
      {problem && canManage ? (
        <button type="button" className={secondary} disabled={busy} onClick={onRecover}>
          Khắc phục
        </button>
      ) : null}
    </div>
  );
}