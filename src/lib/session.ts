import { SignJWT, jwtVerify } from "jose";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not set. Add it to your .env file.");
}
const secretKey = new TextEncoder().encode(JWT_SECRET);

export const SESSION_COOKIE = "ivc_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export type SessionPayload = {
  userId: number;
  username: string;
  displayName: string;
  role: "admin" | "student";
};

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export type FlashcardUndoPayload = {
  scope: "flashcard-undo";
  userId: number;
  wordId: number;
  setId: number;
  mistake: {
    setId: number;
    timesWrong: number;
    lastWrongAt: string;
  } | null;
  progress: {
    known: boolean;
    intervalDays: number;
    reviewStreak: number;
    correctCount: number;
    wrongCount: number;
    lastMode: string | null;
    lastReviewedAt: string | null;
    nextReviewAt: string | null;
    updatedAt: string;
  } | null;
};

export async function signFlashcardUndo(payload: Omit<FlashcardUndoPayload, "scope">): Promise<string> {
  return new SignJWT({ ...payload, scope: "flashcard-undo" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(secretKey);
}

export async function verifyFlashcardUndo(token: string): Promise<FlashcardUndoPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    if (payload.scope !== "flashcard-undo") return null;
    return payload as unknown as FlashcardUndoPayload;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
