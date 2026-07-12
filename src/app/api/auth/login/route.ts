import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword, signSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

const schema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Vui lòng nhập đầy đủ thông tin." }, { status: 400 });
  }
  const { username, password } = parsed.data;

  const user = await db.query.users.findFirst({ where: eq(users.username, username) });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
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
