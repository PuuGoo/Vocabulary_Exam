import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { shareLinks } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireAdminPermission("sharing.manage");
  if (isAuthorizationError(access)) return access;
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid share" }, { status: 400 });
  await db.update(shareLinks).set({ accessMode: "restricted", revokedAt: new Date(), updatedAt: new Date() }).where(eq(shareLinks.id, id));
  return NextResponse.json({ ok: true });
}
