import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth";

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
