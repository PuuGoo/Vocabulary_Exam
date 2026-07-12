import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users, passwordResets } from "@/db/schema";
import { generateToken } from "@/lib/tokens";
import { sendPasswordResetEmail, isEmailConfigured } from "@/lib/mailer";

const schema = z.object({ username: z.string().trim().min(1) });

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Vui lòng nhập tên đăng nhập." }, { status: 400 });

  const user = await db.query.users.findFirst({ where: eq(users.username, parsed.data.username) });

  // Always respond the same way, whether or not the user exists, to avoid leaking account info.
  const genericMessage =
    "Nếu tài khoản tồn tại, hướng dẫn đặt lại mật khẩu đã được xử lý. Nếu bạn không nhận được email, hãy liên hệ quản trị viên để được hỗ trợ đặt lại mật khẩu trực tiếp.";

  if (!user) {
    return NextResponse.json({ ok: true, message: genericMessage });
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await db.insert(passwordResets).values({ userId: user.id, token, expiresAt });

  let emailed = false;
  if (isEmailConfigured() && user.email) {
    const base = req.nextUrl.origin;
    const resetUrl = `${base}/reset-password?token=${token}`;
    emailed = await sendPasswordResetEmail(user.email, resetUrl);
  }

  return NextResponse.json({ ok: true, message: genericMessage, emailed });
}
