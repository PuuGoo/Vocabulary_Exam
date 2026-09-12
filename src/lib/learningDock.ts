export function shouldToggleLearningDock(event: { key: string; repeat?: boolean; isComposing?: boolean; target?: { closest?: (selector: string) => unknown } | null }) {
  if (event.repeat || event.isComposing) return false;
  if (event.target?.closest?.("input,textarea,select,[contenteditable=true]")) return false;
  return event.key.toLowerCase() === "m" || event.key === ".";
}
