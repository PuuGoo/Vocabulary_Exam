import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAdminAccess } from "@/lib/adminAuthorization";
import { ADMIN_PROFILE_LABELS } from "@/lib/adminPermissions";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await getAdminAccess(session);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ profile: access.profile, profileLabel: ADMIN_PROFILE_LABELS[access.profile], permissions: [...access.permissions] });
}
