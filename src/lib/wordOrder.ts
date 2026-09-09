export type PositionedWord = { id: number; position: number };

export function moveWordIdToPosition(orderedIds: readonly number[], wordId: number, targetPosition: number) {
  const currentIndex = orderedIds.indexOf(wordId);
  if (currentIndex < 0 || !Number.isInteger(targetPosition) || targetPosition < 1 || targetPosition > orderedIds.length) {
    return [...orderedIds];
  }
  const next = orderedIds.filter((id) => id !== wordId);
  next.splice(targetPosition - 1, 0, wordId);
  return next;
}

export function moveWordIdByOffset(orderedIds: readonly number[], wordId: number, offset: -1 | 1) {
  const currentIndex = orderedIds.indexOf(wordId);
  if (currentIndex < 0) return [...orderedIds];
  return moveWordIdToPosition(orderedIds, wordId, currentIndex + 1 + offset);
}

export function hasCanonicalWordPositions(rows: readonly PositionedWord[]) {
  return rows.every((row, index) => row.position === index + 1)
    && new Set(rows.map((row) => row.position)).size === rows.length;
}

export function normalizePositionedIds(rows: readonly PositionedWord[]) {
  return [...rows]
    .sort((left, right) => left.position - right.position || left.id - right.id)
    .map((row) => row.id);
}
