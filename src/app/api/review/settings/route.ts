import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { learningGoals } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { DEFAULT_DAILY_REVIEW_WORDS } from "@/lib/reviewPlanner";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [goal] = await db.select({ dailyReviewWords: learningGoals.dailyReviewWords }).from(learningGoals).where(eq(learningGoals.userId, session.userId)).limit(1);
  return NextResponse.json({ dailyReviewWords: goal?.dailyReviewWords || DEFAULT_DAILY_REVIEW_WORDS });
}

const schema = z.object({ dailyReviewWords: z.union([z.literal(20), z.literal(30), z.literal(40), z.literal(60), z.literal(80)]) });
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Mức ôn mỗi ngày không hợp lệ." }, { status: 400 });
  await db.insert(learningGoals).values({ userId: session.userId, dailyReviewWords: parsed.data.dailyReviewWords }).onConflictDoUpdate({
    target: learningGoals.userId, set: { dailyReviewWords: parsed.data.dailyReviewWords, updatedAt: new Date() },
  });
  return NextResponse.json(parsed.data);
}
