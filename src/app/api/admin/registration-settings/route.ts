import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { isPublicRegistrationOpen, REGISTRATION_SETTING_KEY } from "@/lib/registration";

async function requireAdmin() {
  const session = await getSession();
  return session?.role === "admin";
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ open: await isPublicRegistrationOpen() });
}

export async function PUT(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (typeof body?.open !== "boolean") return NextResponse.json({ error: "Trạng thái đăng ký không hợp lệ." }, { status: 400 });
  await db.insert(appSettings).values({ key: REGISTRATION_SETTING_KEY, value: String(body.open), updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: String(body.open), updatedAt: new Date() } });
  return NextResponse.json({ open: body.open });
}
