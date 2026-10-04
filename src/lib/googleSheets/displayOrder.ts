export function visibleWordPositions<Word extends { position: number }>(words: readonly Word[]): Word[] {
  return words.map((word, index) => ({ ...word, position: index + 1 }));
}
