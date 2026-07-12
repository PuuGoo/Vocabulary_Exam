import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { words } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { normalizeText } from "@/lib/text";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await db.delete(words).where(eq(words.id, Number(params.id)));
  return NextResponse.json({ ok: true });
}

const patchSchema = z.object({
  meaning: z.string().trim().min(1).optional(),
  v1: z.string().trim().optional(),
  v2: z.string().trim().optional(),
  v3: z.string().trim().optional(),
  term: z.string().trim().optional(),
  example: z.string().trim().optional(),
  wtype: z.string().trim().optional(),
  ipa: z.string().trim().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  if (Object.keys(parsed.data).length === 0) return NextResponse.json({ error: "Không có thay đổi." }, { status: 400 });

  const patch: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) patch[k] = normalizeText(v);
  }

  const [updated] = await db.update(words).set(patch).where(eq(words.id, Number(params.id))).returning();
  return NextResponse.json({ word: updated });
}
