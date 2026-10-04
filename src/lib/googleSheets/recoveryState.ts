/**
 * Pure connection-state helpers for Google Sheets.
 *
 * This module has no database or network imports so both the server routes and
 * the admin panel (and the tests) can share one definition of what each
 * connection state means. The bug this exists to prevent: the create API used
 * to answer 409 for *any* connection row while the UI derived "Chưa kết nối"
 * from a different reading of the same row.
 */

export type ConnectionState = { enabled: boolean; status: string };

/** Healthy enough to be shown as connected (possibly paused by the admin). */
export function isActiveConnectionState(connection: ConnectionState): boolean {
  if (connection.status === "connected" || connection.status === "syncing") return connection.enabled;
  return false;
}

/** Paused on purpose (not broken): never a new spreadsheet, not an error either. */
export function isPausedConnectionState(connection: ConnectionState): boolean {
  return connection.status === "paused" || (!connection.enabled && !["error", "disconnected", "missing", "archived", "replaced"].includes(connection.status));
}

/** Broken wiring (error / disconnected): needs recovery, not a 409. */
export function isBrokenConnectionState(connection: ConnectionState): boolean {
  return ["error", "disconnected", "missing", "archived", "replaced"].includes(connection.status);
}

/**
 * Single source of truth for the admin UI: how should an existing connection
 * row be presented? The create route and the panel must agree, otherwise the UI
 * says "Chưa kết nối" while the API answers 409.
 */
export type ConnectionView = "none" | "connected" | "paused" | "error" | "disconnected";

export function connectionView(connection: ConnectionState | null | undefined): ConnectionView {
  if (!connection) return "none";
  if (isActiveConnectionState(connection)) return "connected";
  if (isPausedConnectionState(connection)) return "paused";
  if (connection.status === "error") return "error";
  return "disconnected";
}

/** Human-readable, actionable Vietnamese messages (never raw API errors). */
export function connectionViewMessage(view: ConnectionView): string {
  switch (view) {
    case "connected": return "Google Sheet đã tồn tại và đang kết nối.";
    case "paused": return "Google Sheet đã được kết nối nhưng đang tạm dừng. Nhấn \"Tiếp tục\" để đồng bộ trở lại.";
    case "error": return "Google Sheet gặp lỗi kết nối. Có thể khôi phục kết nối hiện có.";
    case "disconnected": return "Cần kết nối lại Google Sheet.";
    default: return "";
  }
}
