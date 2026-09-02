import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { createOrUpdateShare, defaultShareModes, getActiveShare, type ShareTargetType } from "@/lib/shares";

const schema = z.object({ targetType: z.enum(["vocab_set", "question_collection"]), targetId: z.number().int().positive(), accessMode: z.enum(["restricted", "anyone_with_link"]), allowedModes: z.array(z.string()).max(20).default([]) });

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const targetType = request.nextUrl.searchParams.get("targetType") as ShareTargetType | null;
  const targetId = Number(request.nextUrl.searchParams.get("targetId"));
  if (!targetType || !Number.isInteger(targetId)) return NextResponse.json({ error: "Invalid target" }, { status: 400 });
  const share = await getActiveShare(targetType, targetId);
  return NextResponse.json({ share: share ? { id: share.id, accessMode: share.accessMode, allowedModes: share.allowedModesList } : null });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu chia sẻ không hợp lệ." }, { status: 400 });
  const origin = request.nextUrl.origin;
  const result = await createOrUpdateShare({ ...parsed.data, createdByUserId: session.userId, origin });
  return NextResponse.json({ share: result });
}
