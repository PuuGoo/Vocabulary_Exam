import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isShareSlugAvailable } from "@/lib/shares";
import { shareSlugError, validateShareSlug } from "@/lib/shareSlug";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const validation = validateShareSlug(request.nextUrl.searchParams.get("slug") || "");
  if (!validation.valid) return NextResponse.json({ slug: validation.slug, available: false, reason: validation.reason, error: shareSlugError(validation.reason) }, { headers: { "Cache-Control": "no-store" } });
  const currentShareId = Number(request.nextUrl.searchParams.get("shareId"));
  const available = await isShareSlugAvailable(validation.slug, Number.isInteger(currentShareId) && currentShareId > 0 ? currentShareId : null);
  return NextResponse.json({ slug: validation.slug, available, ...(available ? {} : { reason: "taken" }) }, { headers: { "Cache-Control": "no-store" } });
}
