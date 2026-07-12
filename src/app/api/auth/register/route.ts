import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, signSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { normalizeText } from "@/lib/text";

const schema = z.object({
  username: z.string().trim().min(3, "Tên đăng nhập tối thiểu 3 ký tự").max(64),
  password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự").max(128),
  displayName: z.string().trim().min(1).max(128).optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { username, password, displayName } = parsed.data;

  const existing = await db.query.users.findFirst({ where: eq(users.username, username) });
  if (existing) {
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
