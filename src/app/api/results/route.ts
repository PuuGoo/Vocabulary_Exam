import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { attempts } from "@/db/schema";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select()
    .from(attempts)
    .where(eq(attempts.userId, session.userId))
    .orderBy(desc(attempts.createdAt));
  return NextResponse.json({ results: rows });
}

const schema = z.object({
  setId: z.number().int(),
  setName: z.string().min(1),
  mode: z.enum(["fill", "mc"]),
  score: z.number().int().min(0),
  total: z.number().int().min(0),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });

  const [row] = await db
    .insert(attempts)
    .values({ userId: session.userId, ...parsed.data })
    .returning();
  return NextResponse.json({ result: row });
}
