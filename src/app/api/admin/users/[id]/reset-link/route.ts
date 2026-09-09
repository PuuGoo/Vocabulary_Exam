import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { passwordResets, users } from "@/db/schema";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { generateToken } from "@/lib/tokens";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireAdminPermission("users.reset_password");
  if (isAuthorizationError(access)) return access;
  const targetId = Number(params.id);
  const user = await db.query.users.findFirst({ where: eq(users.id, targetId) });
  if (!user) return NextResponse.json({ error: "Không tìm thấy người dùng." }, { status: 404 });
  if (user.adminProfile === "owner" && access.profile !== "owner") return NextResponse.json({ error: "Chỉ Owner có thể đặt lại mật khẩu Owner khác." }, { status: 403 });

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await db.insert(passwordResets).values({ userId: user.id, token, expiresAt });

  const base = req.nextUrl.origin;
  const resetUrl = `${base}/reset-password?token=${token}`;
  return NextResponse.json({ resetUrl });
}
