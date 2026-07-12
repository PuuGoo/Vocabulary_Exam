import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getSession, hashPassword } from "@/lib/auth";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const targetId = Number(params.id);
  if (targetId === session.userId) {
    return NextResponse.json({ error: "Không thể tự xoá tài khoản đang đăng nhập." }, { status: 400 });
  }
  await db.delete(users).where(eq(users.id, targetId));
  return NextResponse.json({ ok: true });
}

const patchSchema = z.object({
  newPassword: z.string().min(6).max(128).optional(),
  role: z.enum(["admin", "student"]).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const targetId = Number(params.id);
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });

  const patch: { passwordHash?: string; role?: "admin" | "student" } = {};
  if (parsed.data.newPassword) patch.passwordHash = await hashPassword(parsed.data.newPassword);
  if (parsed.data.role) patch.role = parsed.data.role;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Không có thay đổi." }, { status: 400 });

  await db.update(users).set(patch).where(eq(users.id, targetId));
  return NextResponse.json({ ok: true });
}
