import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getSession, hashPassword } from "@/lib/auth";
import { normalizeText } from "@/lib/text";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rows = await db
    .select({ id: users.id, username: users.username, displayName: users.displayName, role: users.role, createdAt: users.createdAt })
    .from(users)
    .orderBy(users.createdAt);
  return NextResponse.json({ users: rows });
}

const createSchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(6).max(128),
  displayName: z.string().trim().min(1).max(128),
  role: z.enum(["admin", "student"]),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const existing = await db.query.users.findFirst({ where: eq(users.username, parsed.data.username) });
  if (existing) return NextResponse.json({ error: "Tên đăng nhập đã tồn tại." }, { status: 409 });

  const passwordHash = await hashPassword(parsed.data.password);
  const [user] = await db
    .insert(users)
    .values({
      username: parsed.data.username,
      passwordHash,
      displayName: normalizeText(parsed.data.displayName),
      role: parsed.data.role,
    })
    .returning();
  return NextResponse.json({ user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role } });
}
