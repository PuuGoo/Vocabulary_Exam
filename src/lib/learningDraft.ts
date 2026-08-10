export const LEARNING_DRAFT_MAX_AGE = 24 * 60 * 60 * 1000;

export function isLearningDraftFresh(savedAt: number, now = Date.now()) {
  return Number.isFinite(savedAt) && savedAt > 0 && savedAt <= now && now - savedAt < LEARNING_DRAFT_MAX_AGE;
}

export function restoreItemsByIds<T extends { id: number }>(items: T[], ids: number[]) {
  if (!Array.isArray(ids) || ids.length === 0 || new Set(ids).size !== ids.length) return null;
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const restored: T[] = [];
  for (const id of ids) {
    if (!Number.isInteger(id)) return null;
    const item = itemsById.get(id);
    if (!item) return null;
    restored.push(item);
  }
  return restored;
}
