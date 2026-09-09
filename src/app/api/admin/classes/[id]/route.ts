import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { classes } from "@/db/schema";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireAdminPermission("classes.delete");
  if (isAuthorizationError(access)) return access;
  await db.delete(classes).where(eq(classes.id, Number(params.id)));
  return NextResponse.json({ ok: true });
}
