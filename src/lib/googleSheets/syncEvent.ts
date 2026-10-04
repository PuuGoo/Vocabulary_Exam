/**
 * Lightweight browser event emitted after a Google Sheets sync changes
 * vocabulary data.
 *
 * Why an event and not only a React prop: the vocabulary list lives in the
 * parent admin page, while the sync can be triggered by the panel's own
 * "Đồng bộ ngay" button OR by a webhook that finishes while the panel is
 * mounted. Both paths must reach the parent, and the parent may not be a direct
 * ancestor in every render branch. `GoogleSheetsPanel` still prefers the
 * `onVocabularyChanged` prop; the event covers the webhook-driven case and any
 * other listener that needs to react.
 */

export const GOOGLE_SHEET_SYNCED_EVENT = "lexora:google-sheet-synced";

export type GoogleSheetSyncedDetail = {
  setId: number;
  connectionId: number;
  changedWordIds: number[];
  rowsCreated: number;
  rowsUpdated: number;
  rowsDeleted: number;
  finishedAt: string | null;
};

/** True when a sync actually changed vocabulary (so the UI must re-read). */
export function hasVocabularyChanges(detail: Pick<GoogleSheetSyncedDetail, "changedWordIds" | "rowsCreated" | "rowsDeleted"> & { rowsUpdated?: number }): boolean {
  return detail.changedWordIds.length > 0 || detail.rowsCreated > 0 || detail.rowsDeleted > 0 || (detail.rowsUpdated ?? 0) > 0;
}

export function emitGoogleSheetSynced(detail: GoogleSheetSyncedDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<GoogleSheetSyncedDetail>(GOOGLE_SHEET_SYNCED_EVENT, { detail }));
}
