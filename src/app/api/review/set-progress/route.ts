import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { initializeSetReview } from "@/lib/reviewService";

const schema = z.object({ setId: z.number().int().positive(), context: z.literal("initial_learn_complete") });

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Chỉ phiên Học hoàn tất mới có thể tạo lịch củng cố." }, { status: 400 });
  try {
    return NextResponse.json(await initializeSetReview(session.userId, session.role, parsed.data.setId));
  } catch {
    return NextResponse.json({ error: "Không tìm thấy bộ từ trong phạm vi của bạn." }, { status: 404 });
  }
}
