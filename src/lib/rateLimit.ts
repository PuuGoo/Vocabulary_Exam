/**
 * Simple in-memory rate limiter. Suitable for single-instance deployments
 * (Vercel serverless = one instance per cold start, which is acceptable).
 * For multi-instance deployments, replace with Redis-backed limiter.
 */
type Attempt = { count: number; windowStart: number; lockedUntil: number };

const store = new Map<string, Attempt>();
const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanup(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, item] of store) {
    if (item.lockedUntil > 0 && item.lockedUntil < now) store.delete(key);
  }
}

export interface RateLimitConfig {
  windowMs: number;
  maxAttempts: number;
  lockoutMs?: number;
}

export interface RateLimitResult {
  limited: boolean;
  retryAfterSeconds?: number;
}

export function checkRateLimit(key: string, config: RateLimitConfig, now = Date.now()): RateLimitResult {
  cleanup(now);
  const item = store.get(key);
  if (!item) return { limited: false };
  if (item.lockedUntil > now) return { limited: true, retryAfterSeconds: Math.ceil((item.lockedUntil - now) / 1000) };
  if (now - item.windowStart >= config.windowMs) { store.delete(key); return { limited: false }; }
  return { limited: false };
}

export function recordRateLimitHit(key: string, config: RateLimitConfig, now = Date.now()): RateLimitResult {
  cleanup(now);
  let item = store.get(key);
  if (!item || now - item.windowStart >= config.windowMs) {
    item = { count: 0, windowStart: now, lockedUntil: 0 };
  }
  item.count += 1;
  if (item.count >= config.maxAttempts && config.lockoutMs) {
    item.lockedUntil = now + config.lockoutMs;
  }
  store.set(key, item);
  if (item.lockedUntil > now) return { limited: true, retryAfterSeconds: Math.ceil((item.lockedUntil - now) / 1000) };
  return { limited: false };
}

export function resetRateLimit(key: string) { store.delete(key); }

export const LOGIN_RATE_LIMIT: RateLimitConfig = { windowMs: 15 * 60 * 1000, maxAttempts: 10, lockoutMs: 15 * 60 * 1000 };
export const REGISTER_RATE_LIMIT: RateLimitConfig = { windowMs: 60 * 60 * 1000, maxAttempts: 5, lockoutMs: 30 * 60 * 1000 };
export const FORGOT_PASSWORD_RATE_LIMIT: RateLimitConfig = { windowMs: 60 * 60 * 1000, maxAttempts: 5, lockoutMs: 30 * 60 * 1000 };