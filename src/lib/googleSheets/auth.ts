import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { googleSheetOauthTokens } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/googleSheets/crypto";
import { GoogleSheetsError } from "@/lib/googleSheets/errors";

// Least privilege: spreadsheets (for files Lexora creates/manages) plus a
// file-level Drive scope so per-file watches work without full Drive access.
export const GOOGLE_SHEETS_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
] as const;

export type StoredGoogleToken = { accessToken: string; refreshToken: string | null; expiresAt: Date; scope: string };

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
}

export function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new GoogleSheetsError("Google OAuth chưa được cấu hình trên máy chủ.", "NOT_CONFIGURED", { retryable: false });
  }
  return { clientId, clientSecret, redirectUri };
}

export async function storeGoogleToken(userId: number, token: { access_token?: string | null; refresh_token?: string | null; expiry_date?: number | null; scope?: string | null }) {
  if (!token.access_token) throw new GoogleSheetsError("Google không cấp access token.", "OAUTH_REQUIRED", { retryable: false });
  const expiresAt = token.expiry_date ? new Date(token.expiry_date) : new Date(Date.now() + 55 * 60 * 1000);
  const [existing] = await db
    .select({ id: googleSheetOauthTokens.id, refreshTokenEncrypted: googleSheetOauthTokens.refreshTokenEncrypted })
    .from(googleSheetOauthTokens)
    .where(eq(googleSheetOauthTokens.userId, userId))
    .limit(1);
  // Google only returns a refresh_token on the first consent; keep the stored one otherwise.
  const refreshTokenEncrypted = token.refresh_token ? encryptSecret(token.refresh_token) : existing?.refreshTokenEncrypted ?? null;
  const values = {
    userId,
    scope: token.scope || GOOGLE_SHEETS_SCOPES.join(" "),
    tokenType: "Bearer",
    accessTokenEncrypted: encryptSecret(token.access_token),
    refreshTokenEncrypted,
    expiresAt,
    updatedAt: new Date(),
  };
  if (existing) await db.update(googleSheetOauthTokens).set(values).where(eq(googleSheetOauthTokens.id, existing.id));
  else await db.insert(googleSheetOauthTokens).values(values);
}

export async function loadGoogleToken(userId: number): Promise<StoredGoogleToken | null> {
  const [row] = await db.select().from(googleSheetOauthTokens).where(eq(googleSheetOauthTokens.userId, userId)).limit(1);
  if (!row) return null;
  return {
    accessToken: decryptSecret(row.accessTokenEncrypted),
    refreshToken: row.refreshTokenEncrypted ? decryptSecret(row.refreshTokenEncrypted) : null,
    expiresAt: row.expiresAt,
    scope: row.scope,
  };
}

export async function clearGoogleToken(userId: number) {
  await db.delete(googleSheetOauthTokens).where(eq(googleSheetOauthTokens.userId, userId));
}

function stateSecret(): string {
  const secret = process.env.GOOGLE_WEBHOOK_TOKEN_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error("Missing GOOGLE_WEBHOOK_TOKEN_SECRET/JWT_SECRET.");
  return secret;
}

/** Signed state so the OAuth callback can only resume its own flow. */
export function googleOAuthStateFor(userId: number, next: string): string {
  const payload = Buffer.from(JSON.stringify({ userId, next, nonce: randomBytes(8).toString("hex") }), "utf8").toString("base64url");
  return `${payload}.${signState(payload)}`;
}

export function parseGoogleOAuthState(state: string): { userId: number; next: string } | null {
  const [payload, signature] = state.split(".");
  if (!payload || !signature || !safeEqual(signature, signState(payload))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { userId?: unknown; next?: unknown };
    if (!Number.isInteger(parsed.userId)) return null;
    return { userId: parsed.userId as number, next: typeof parsed.next === "string" ? parsed.next : "/admin/sets" };
  } catch { return null; }
}

function signState(payload: string): string {
  return createHmac("sha256", stateSecret()).update(payload).digest("hex");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
