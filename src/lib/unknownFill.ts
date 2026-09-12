export type FillWordScope = "all" | "unknown";

export function resolveFillWordScope(input: {
  mode: string;
  scope: string | null;
  retest: boolean;
  quickMode: boolean;
}): FillWordScope {
  // Retest remains the mistakes-based flow. It deliberately wins over scope
  // when a malformed URL contains both parameters.
  if (input.mode !== "fill" || input.scope !== "unknown" || input.retest || input.quickMode) {
    return "all";
  }
  return "unknown";
}

export function filterWordsByFillScope<T extends { id: number }>(
  words: readonly T[],
  progress: Record<number, boolean>,
  scope: FillWordScope,
): T[] {
  if (scope !== "unknown") return [...words];
  return words.filter((word) => progress[word.id] === false);
}

export function quizProgressMode(mode: string, scope: FillWordScope): string {
  return mode === "fill" && scope === "unknown" ? "fill_unknown" : mode;
}

export function fillScopeDraftSegment(scope: FillWordScope): string {
  // Keep the legacy all-words key stable; only the new scope gets a suffix.
  return scope === "unknown" ? "-scope-unknown" : "";
}
