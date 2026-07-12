import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { mistakes } from "@/db/schema";
import { getSession } from "@/lib/auth";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await db.delete(mistakes).where(and(eq(mistakes.id, Number(params.id)), eq(mistakes.userId, session.userId)));
  return NextResponse.json({ ok: true });
}
