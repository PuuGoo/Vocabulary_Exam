import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await db.query.users.findFirst({ where: eq(users.id, session.userId) });
  return NextResponse.json({ email: user?.email || "" });
}

const schema = z.object({ email: z.string().email().max(256).optional().or(z.literal("")) });

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Email không hợp lệ." }, { status: 400 });
  await db.update(users).set({ email: parsed.data.email || null }).where(eq(users.id, session.userId));
  return NextResponse.json({ ok: true });
}
