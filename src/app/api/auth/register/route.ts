import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, signSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { normalizeText } from "@/lib/text";
import { isPublicRegistrationOpen } from "@/lib/registration";
import { checkRateLimit, recordRateLimitHit, REGISTER_RATE_LIMIT } from "@/lib/rateLimit";

const schema = z.object({
  username: z.string().trim().min(3, "Tên đăng nhập tối thiểu 3 ký tự").max(64),
  password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự").max(128),
  displayName: z.string().trim().min(1).max(128).optional(),
});

function getClientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: NextRequest) {
  if (!(await isPublicRegistrationOpen())) return NextResponse.json({ error: "Đăng ký tài khoản mới đang tạm khóa. Vui lòng liên hệ quản trị viên." }, { status: 403 });

  const ip = getClientIp(req);
  const rl = checkRateLimit(`register:${ip}`, REGISTER_RATE_LIMIT);
  if (rl.limited) {
    return NextResponse.json({ error: "Bạn đã đăng ký quá nhiều lần. Vui lòng đợi một lúc." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds || 60) } });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { username, password, displayName } = parsed.data;

  const existing = await db.query.users.findFirst({ where: eq(users.username, username) });
  if (existing) {
    recordRateLimitHit(`register:${ip}`, REGISTER_RATE_LIMIT);
    return NextResponse.json({ error: "Tên đăng nhập đã tồn tại." }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({
      username,
      passwordHash,
      displayName: normalizeText(displayName || username),
      role: "student",
    })
    .returning();

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