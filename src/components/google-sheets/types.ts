export type Connection = {
  id: number; setId: number; spreadsheetId: string; spreadsheetUrl: string; spreadsheetName: string;
  sheetTitle: string; templateType: string; templateVersion: number; deleteBehavior: string;
  enabled: boolean; status: string; lastSyncedAt: string | null; lastSuccessfulSyncAt: string | null;
  /** Lexora prepared the native Google Sheets AI formula columns (default true). */
  aiEnrich?: boolean;
  /** Admin-authored instruction text per AI column; null/absent = built-in default. */
  aiPrompts?: Record<string, string> | null;
  lastError: string | null; wordCount: number; columnCount: number; channelExpiresAt: string | null;
};
export type SyncRun = {
  id: number; triggerType: string; startedAt: string; finishedAt: string | null; status: string;
  rowsCreated: number; rowsUpdated: number; rowsUnchanged: number; rowsDeleted: number;
  rowsSkipped?: number | null; validationErrorCount?: number | null; errorMessage: string | null; metadata?: string;
};

export type StatusView = "connected" | "syncing" | "paused" | "error" | "disconnected";

export const STATUS_LABEL: Record<StatusView, { label: string; dot: string; className: string }> = {
  connected: { label: "Đang tự động đồng bộ", dot: "bg-emerald-500", className: "text-emerald-700" },
  syncing: { label: "Đang đồng bộ…", dot: "bg-amber-500 animate-pulse", className: "text-amber-700" },
  paused: { label: "Đã tạm dừng đồng bộ", dot: "bg-orange-500", className: "text-orange-600" },
  error: { label: "Đồng bộ đang gặp vấn đề", dot: "bg-red-500", className: "text-red-700" },
  disconnected: { label: "Đã ngắt kết nối", dot: "bg-gray-400", className: "text-gray-600" },
};

/** The backend keeps its own status values; the admin only ever reads these sentences. */
export function statusView(connection: Connection | null): StatusView {
  if (!connection) return "disconnected";
  if (connection.status === "disconnected") return "disconnected";
  if (!connection.enabled && connection.status === "connected") return "paused";
  if (connection.status === "syncing") return "syncing";
  if (connection.status === "paused") return "paused";
  if (connection.status === "error") return "error";
  return "connected";
}

/** An expired watch channel means automatic sync silently stopped, so it reads as a problem. */
export function isChannelExpired(connection: Connection | null) {
  if (!connection?.channelExpiresAt) return false;
  const expires = new Date(connection.channelExpiresAt).getTime();
  return Number.isFinite(expires) && expires <= Date.now();
}

export function formatDate(value: string | null) {
  if (!value) return "Chưa đồng bộ";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa đồng bộ";
  return date.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatClock(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function templateLabel(templateType: string) {
  if (templateType === "irregular_verb") return "Động từ bất quy tắc";
  if (templateType === "language_vocab_mandarin") return "Mandarin";
  return "IELTS";
}

export const btn = "min-h-11 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-50";
export const primary = `${btn} bg-emerald-700 text-white hover:bg-emerald-800`;
export const secondary = `${btn} border border-line bg-white text-ink hover:bg-gray-50`;
export const danger = `${btn} border border-red-200 bg-white text-red-700 hover:bg-red-50`;
