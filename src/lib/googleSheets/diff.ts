export type SyncAction = "CREATED" | "UPDATED" | "UNCHANGED" | "DELETED" | "DUPLICATE" | "INVALID" | "CONFLICT";

export type SyncPlanItem = {
  action: SyncAction;
  rowNumber: number;
  sourceId: string;
  wordId?: number;
  fingerprint?: string;
  message?: string;
};

export type SyncPlan = {
  items: SyncPlanItem[];
  counts: Record<SyncAction, number>;
  invalidRows: SyncPlanItem[];
  duplicateRows: SyncPlanItem[];
  conflictRows: SyncPlanItem[];
};

export function createSyncPlan(items: readonly SyncPlanItem[]): SyncPlan {
  const counts: Record<SyncAction, number> = { CREATED: 0, UPDATED: 0, UNCHANGED: 0, DELETED: 0, DUPLICATE: 0, INVALID: 0, CONFLICT: 0 };
  for (const item of items) counts[item.action] += 1;
  return {
    items: [...items],
    counts,
    invalidRows: items.filter((item) => item.action === "INVALID"),
    duplicateRows: items.filter((item) => item.action === "DUPLICATE"),
    conflictRows: items.filter((item) => item.action === "CONFLICT"),
  };
}

/**
 * Decide what to do with one source row against its current DB state.
 *
 * - New row without an ID → CREATED (engine will mint + write back the ID)
 * - ID resolves to a word and content changed → UPDATED (same wordId)
 * - ID resolves and content identical → UNCHANGED
 * - ID resolves but DB content changed since the last sync of *this* row and
 *   the row also changed → CONFLICT (never silently overwrite manual edits)
 * - Same sourceId seen twice → DUPLICATE
 */
export function planRow(item: {
  action: SyncAction;
  rowNumber: number;
  sourceId: string;
  wordId?: number;
  fingerprint?: string;
  lastSyncedFingerprint?: string;
  dbFingerprint?: string;
  message?: string;
}): SyncPlanItem {
  let action = item.action;
  if (action === "UPDATED" && item.lastSyncedFingerprint && item.dbFingerprint && item.dbFingerprint !== item.lastSyncedFingerprint) {
    action = "CONFLICT";
  }
  return { action, rowNumber: item.rowNumber, sourceId: item.sourceId, wordId: item.wordId, fingerprint: item.fingerprint, message: item.message };
}
