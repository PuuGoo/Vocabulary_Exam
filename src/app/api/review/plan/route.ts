import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { buildReviewPlanForUser, completeReviewBatch, getUpcomingReviewOverview } from "@/lib/reviewService";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const plan = await buildReviewPlanForUser(session.userId, session.role, { extra: req.nextUrl.searchParams.get("extra") === "1" });
  const upcoming = await getUpcomingReviewOverview(session.userId, session.role, plan.plannedWords);
  return NextResponse.json({ today: {
    wordBudget: plan.wordBudget, completedWords: plan.completedToday, plannedWords: plan.plannedWords,
    totalDueWords: plan.totalDueWords, overdueWords: plan.overdueWords, dueSetReviews: plan.dueSetReviews,
    estimatedMinutes: plan.estimatedMinutes,
  }, batches: plan.batches, backlog: plan.backlog, upcoming });
}

const completionSchema = z.object({
  idempotencyKey: z.string().min(8).max(96), setId: z.number().int().positive(),
  expectedStage: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  outcomes: z.array(z.object({ wordId: z.number().int().positive(), correct: z.boolean() })).min(1).max(100),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = completionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu phiên ôn không hợp lệ." }, { status: 400 });
  try {
    return NextResponse.json(await completeReviewBatch(session.userId, session.role, parsed.data));
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "STALE_STAGE") return NextResponse.json({ error: "Lịch ôn đã được cập nhật ở một phiên khác." }, { status: 409 });
    if (["SET_NOT_FOUND", "INVALID_WORDS"].includes(code)) return NextResponse.json({ error: "Bộ từ hoặc từ không thuộc quyền truy cập của bạn." }, { status: 403 });
    return NextResponse.json({ error: "Không thể hoàn thành phiên ôn." }, { status: 400 });
  }
}
