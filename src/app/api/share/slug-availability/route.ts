import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isShareSlugAvailable } from "@/lib/shares";
import { shareSlugError, validateShareSlug } from "@/lib/shareSlug";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const access = await requireAdminPermission("sharing.manage");
  if (isAuthorizationError(access)) return access;
  const validation = validateShareSlug(request.nextUrl.searchParams.get("slug") || "");
  if (!validation.valid) return NextResponse.json({ slug: validation.slug, available: false, reason: validation.reason, error: shareSlugError(validation.reason) }, { headers: { "Cache-Control": "no-store" } });
  const currentShareId = Number(request.nextUrl.searchParams.get("shareId"));
  const available = await isShareSlugAvailable(validation.slug, Number.isInteger(currentShareId) && currentShareId > 0 ? currentShareId : null);
  return NextResponse.json({ slug: validation.slug, available, ...(available ? {} : { reason: "taken" }) }, { headers: { "Cache-Control": "no-store" } });
}
