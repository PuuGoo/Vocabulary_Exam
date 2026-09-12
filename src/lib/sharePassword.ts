import { cookies } from "next/headers";
import { SHARE_ACCESS_MAX_AGE_SECONDS, signShareAccess, verifyShareAccess } from "@/lib/session";
import { validateSharePassword } from "@/lib/sharePasswordPolicy";
import { shareAccessMatches } from "@/lib/sharePasswordPolicy";
export { hashSharePassword, verifySharePassword } from "@/lib/sharePasswordHash";
export { clearShareUnlockFailures, recordShareUnlockFailure, shareUnlockRateStatus } from "@/lib/shareUnlockRateLimit";
export { validateSharePassword } from "@/lib/sharePasswordPolicy";

export function shareAccessCookieName(shareId: number) { return `lexora_share_${shareId}`; }

export async function hasShareAccess(share: { id: number; passwordEnabled: boolean; passwordVersion: number }) {
  if (!share.passwordEnabled) return true;
  const token = cookies().get(shareAccessCookieName(share.id))?.value;
  if (!token) return false;
  const proof = await verifyShareAccess(token);
  return shareAccessMatches(proof, share);
}

export async function createShareAccessProof(shareId: number, passwordVersion: number) {
  return signShareAccess(shareId, passwordVersion);
}

export function shareAccessCookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: SHARE_ACCESS_MAX_AGE_SECONDS };
}
