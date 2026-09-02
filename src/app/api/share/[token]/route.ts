import { NextRequest, NextResponse } from "next/server";
import { getPublicSharePayload } from "@/lib/shares";

export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  const mode = request.nextUrl.searchParams.get("mode") || undefined;
  const setId = Number(request.nextUrl.searchParams.get("set"));
  const result = await getPublicSharePayload(params.token, mode, Number.isInteger(setId) && setId > 0 ? setId : undefined, request.nextUrl.searchParams.get("collection") || undefined);
  if (!result.share) return NextResponse.json({ error: "SHARE_NOT_FOUND" }, { status: 404 });
  if (result.error === "mode_not_allowed") return NextResponse.json({ error: "MODE_NOT_ALLOWED" }, { status: 403 });
  if (result.error === "target_missing") return NextResponse.json({ error: "SHARED_CONTENT_MISSING" }, { status: 404 });
  return NextResponse.json(result.payload, { headers: { "Cache-Control": "private, max-age=30" } });
}
