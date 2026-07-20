export type PomodoroPhase = "focus" | "short_break" | "long_break";

export function nextPomodoroPhase(phase: PomodoroPhase, completedFocus: number) {
  if (phase !== "focus") return { phase: "focus" as const, completedFocus };
  const nextCompleted = completedFocus + 1;
  return { phase: nextCompleted % 4 === 0 ? "long_break" as const : "short_break" as const, completedFocus: nextCompleted };
}

export function remainingSeconds(endAt: number, now = Date.now()) {
  return Math.max(0, Math.ceil((endAt - now) / 1000));
}

export function formatTimer(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}
