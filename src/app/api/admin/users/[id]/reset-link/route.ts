import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { passwordResets, users } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { generateToken } from "@/lib/tokens";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const targetId = Number(params.id);
  const user = await db.query.users.findFirst({ where: eq(users.id, targetId) });
  if (!user) return NextResponse.json({ error: "Không tìm thấy người dùng." }, { status: 404 });

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await db.insert(passwordResets).values({ userId: user.id, token, expiresAt });

  const base = req.nextUrl.origin;
  const resetUrl = `${base}/reset-password?token=${token}`;
  return NextResponse.json({ resetUrl });
}
