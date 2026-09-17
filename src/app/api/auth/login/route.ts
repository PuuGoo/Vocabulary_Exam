import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword, signSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { checkRateLimit, recordRateLimitHit, LOGIN_RATE_LIMIT } from "@/lib/rateLimit";

const schema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

function getClientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = checkRateLimit(`login:${ip}`, LOGIN_RATE_LIMIT);
  if (rl.limited) {
    return NextResponse.json({ error: "Too many login attempts. Please try again later." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds || 60) } });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Vui lòng nhập đầy đủ thông tin." }, { status: 400 });
  }
  const { username, password } = parsed.data;

  const user = await db.query.users.findFirst({ where: eq(users.username, username) });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    recordRateLimitHit(`login:${ip}`, LOGIN_RATE_LIMIT);
    return NextResponse.json({ error: "Sai tên đăng nhập hoặc mật khẩu." }, { status: 401 });
  }

  const token = await signSession({
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role as "admin" | "student",
  });

  const res = NextResponse.json({
    user: { username: user.username, displayName: user.displayName, role: user.role },
  });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}