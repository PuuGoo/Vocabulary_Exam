type Attempt = { failures: number; windowStartedAt: number; lockedUntil: number };
const attempts = new Map<string, Attempt>();
export const SHARE_UNLOCK_WINDOW_MS = 10 * 60 * 1000;
export const SHARE_UNLOCK_LOCK_MS = 15 * 60 * 1000;
export const SHARE_UNLOCK_MAX_FAILURES = 5;

export function shareUnlockRateStatus(key: string, now = Date.now()) {
  const item = attempts.get(key);
  if (!item) return { limited: false };
  if (item.lockedUntil > now) return { limited: true, retryAfterSeconds: Math.max(1, Math.ceil((item.lockedUntil - now) / 1000)) };
  if (now - item.windowStartedAt >= SHARE_UNLOCK_WINDOW_MS) attempts.delete(key);
  return { limited: false };
}

export function recordShareUnlockFailure(key: string, now = Date.now()) {
  const current = attempts.get(key);
  const item = !current || now - current.windowStartedAt >= SHARE_UNLOCK_WINDOW_MS ? { failures: 0, windowStartedAt: now, lockedUntil: 0 } : current;
  item.failures += 1;
  if (item.failures >= SHARE_UNLOCK_MAX_FAILURES) item.lockedUntil = now + SHARE_UNLOCK_LOCK_MS;
  if (!attempts.has(key) && attempts.size >= 10_000) attempts.delete(attempts.keys().next().value as string);
  attempts.set(key, item);
  return shareUnlockRateStatus(key, now);
}

export function clearShareUnlockFailures(key: string) { attempts.delete(key); }
