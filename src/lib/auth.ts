import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken, type SessionPayload } from "@/lib/session";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export { SESSION_COOKIE, signSession, sessionCookieOptions } from "@/lib/session";
export type { SessionPayload } from "@/lib/session";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Read + verify the current session from the request cookie (Server Components / Route Handlers). */
export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySessionToken(token);
  if (!payload) return null;
  const [current] = await db.select({ id: users.id, username: users.username, displayName: users.displayName, role: users.role }).from(users).where(eq(users.id, payload.userId)).limit(1);
  if (!current || (current.role !== "admin" && current.role !== "student")) return null;
  return { userId: current.id, username: current.username, displayName: current.displayName, role: current.role };
}
