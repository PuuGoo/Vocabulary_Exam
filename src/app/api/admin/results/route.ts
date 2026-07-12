import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { attempts, users } from "@/db/schema";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db
    .select({
      id: attempts.id,
      setName: attempts.setName,
      mode: attempts.mode,
      score: attempts.score,
      total: attempts.total,
      createdAt: attempts.createdAt,
      username: users.username,
      displayName: users.displayName,
    })
    .from(attempts)
    .innerJoin(users, eq(attempts.userId, users.id))
    .orderBy(desc(attempts.createdAt));

  return NextResponse.json({ results: rows });
}
