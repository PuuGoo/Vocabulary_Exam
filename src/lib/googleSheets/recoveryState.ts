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
  // "archived" / "replaced" are terminal: the Sheet is trashed or swapped and
  // must never be reused via the normal create flow. They are broken but not
  // recoverable, so create must refuse them with an actionable 409 instead of
  // trying to heal the row.
  return ["error", "disconnected", "missing"].includes(connection.status);
}

/**
 * Terminal wiring: the Sheet was intentionally archived / replaced.
 * Treated as broken but requires explicit user action (create new / replace)
 * rather than silent recovery of the same connection row.
 */
export function isTerminalConnectionState(connection: ConnectionState): boolean {
  return ["archived", "replaced"].includes(connection.status);
}

/**
 * Single source of truth for the admin UI: how should an existing connection
 * row be presented? The create route and the panel must agree, otherwise the UI
 * says "Chưa kết nối" while the API answers 409.
 */
export type ConnectionView = "none" | "connected" | "paused" | "error" | "disconnected" | "archived" | "replaced";

export function connectionView(connection: ConnectionState | null | undefined): ConnectionView {
  if (!connection) return "none";
  if (connection.status === "archived") return "archived";
  if (connection.status === "replaced") return "replaced";
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
    case "archived": return "Google Sheet đã được đưa vào Thùng rác. Tạo Sheet mới để tiếp tục.";
    case "replaced": return "Google Sheet đã được thay thế bằng Sheet khác.";
    default: return "";
  }
}
