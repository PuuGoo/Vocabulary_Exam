import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { adminAuditLogs, appSettings } from "@/db/schema";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { isPublicRegistrationOpen, REGISTRATION_SETTING_KEY } from "@/lib/registration";
export async function GET() { const access = await requireAdminPermission("registration.view"); if (isAuthorizationError(access)) return access; return NextResponse.json({ open: await isPublicRegistrationOpen() }); }
export async function PUT(request: NextRequest) {
  const access = await requireAdminPermission("registration.manage"); if (isAuthorizationError(access)) return access;
  const body = await request.json().catch(() => null); if (typeof body?.open !== "boolean") return NextResponse.json({ error: "Trạng thái đăng ký không hợp lệ." }, { status: 400 });
  await db.transaction(async (tx) => { await tx.insert(appSettings).values({ key: REGISTRATION_SETTING_KEY, value: String(body.open), updatedAt: new Date() }).onConflictDoUpdate({ target: appSettings.key, set: { value: String(body.open), updatedAt: new Date() } }); await tx.insert(adminAuditLogs).values({ actorUserId: access.userId, actorDisplayName: access.displayName, action: "registration.update", resourceType: "setting", resourceId: REGISTRATION_SETTING_KEY, metadata: JSON.stringify({ open: body.open }) }); });
  return NextResponse.json({ open: body.open });
}
