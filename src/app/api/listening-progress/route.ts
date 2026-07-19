import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { recordDailyActivity } from "@/lib/activity";

const schema = z.object({ wordsReviewed: z.number().int().min(1).max(500) });

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  await recordDailyActivity(session.userId, { wordsReviewed: parsed.data.wordsReviewed });
  return NextResponse.json({ ok: true });
}
