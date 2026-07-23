export type SwipeDirection = "left" | "right" | null;

export function getSwipeDirection(deltaX: number, deltaY: number, elapsedMs: number): SwipeDirection {
  const horizontal = Math.abs(deltaX) > Math.abs(deltaY) * 1.25;
  const intentional = Math.abs(deltaX) >= 52 || (Math.abs(deltaX) >= 30 && elapsedMs <= 250);
  if (!horizontal || !intentional) return null;
  return deltaX < 0 ? "left" : "right";
}
