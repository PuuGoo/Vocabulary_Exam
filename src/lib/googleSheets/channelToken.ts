import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Channel token for Google Drive push notifications.
 *
 * `drive.files.watch` echoes the token we send back as the
 * `X-Goog-Channel-Token` request header. Google does not compute it from the
 * notification body (which is empty for files.watch), so we generate a random
 * value here and keep only a SHA-256 digest in the database. The digest is
 * enough to verify the incoming header and means the secret is never stored,
 * logged or shipped to the browser.
 */

/** 32 random bytes as hex: short enough for a header, hard enough to guess. */
export function generateChannelToken(): string {
  return randomBytes(32).toString("hex");
}

/** SHA-256 digest of a channel token, hex encoded. */
export function hashChannelToken(token: string): string {
  return createHash("sha256").update(String(token), "utf8").digest("hex");
}

/**
 * Compare an incoming token against a stored digest in constant time.
 *
 * Both arguments are optional/nullable: a legacy channel row (created before
 * this fix) has no digest and can never match, so the webhook rejects it and
 * the renewal flow recreates the channel with a token.
 */
export function verifyChannelToken(incoming: string | null | undefined, storedHash: string | null | undefined): boolean {
  if (!incoming || !storedHash) return false;
  const left = Buffer.from(hashChannelToken(incoming), "utf8");
  const right = Buffer.from(storedHash, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
