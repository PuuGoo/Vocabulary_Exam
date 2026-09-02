import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { createOrUpdateShare, getActiveShare, getCategoryShareContent, type ShareTargetType } from "@/lib/shares";

const schema = z.object({ targetType: z.enum(["vocab_set", "question_collection"]), targetId: z.number().int().positive(), accessMode: z.enum(["restricted", "anyone_with_link"]), allowedModes: z.array(z.string()).max(20).default([]), contentSelection: z.array(z.enum(["vocab", "quiz", "essay", "speaking", "documents"])).max(5).optional(), includeNewContent: z.boolean().optional() });

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const targetType = request.nextUrl.searchParams.get("targetType") as ShareTargetType | null;
  const targetId = Number(request.nextUrl.searchParams.get("targetId"));
  if (!targetType || !["vocab_set", "question_collection"].includes(targetType) || !Number.isInteger(targetId) || targetId <= 0) return NextResponse.json({ error: "Dữ liệu chia sẻ không hợp lệ.", code: "INVALID_SHARE_REQUEST" }, { status: 400 });
  try {
    const share = await getActiveShare(targetType, targetId);
    const content = targetType === "question_collection" ? await getCategoryShareContent(targetId) : null;
    return NextResponse.json({ share: share ? { id: share.id, accessMode: share.accessMode, allowedModes: share.allowedModesList, contentSelection: share.contentSelectionList, includeNewContent: share.includeNewContent } : null, content: content ? { sets: content.sets, documents: content.documents, counts: content.counts } : null });
  } catch (error) {
    console.error("[share:get]", { targetType, targetId, error: error instanceof Error ? { name: error.name, message: error.message } : error });
    return NextResponse.json({ error: "Không thể tải cấu hình liên kết chia sẻ.", code: "SHARE_LOAD_FAILED" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu chia sẻ không hợp lệ." }, { status: 400 });
  const origin = request.nextUrl.origin;
  try {
    const result = await createOrUpdateShare({ ...parsed.data, createdByUserId: session.userId, origin });
    return NextResponse.json({ share: result }, { status: result.url ? 201 : 200 });
  } catch (error) {
    console.error("[share:create]", { targetType: parsed.data.targetType, targetId: parsed.data.targetId, error: error instanceof Error ? { name: error.name, message: error.message } : error });
    return NextResponse.json({ error: "Không thể lưu liên kết chia sẻ.", code: "SHARE_SAVE_FAILED" }, { status: 500 });
  }
}
