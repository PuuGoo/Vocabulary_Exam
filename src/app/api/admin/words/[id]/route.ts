import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { words } from "@/db/schema";
import {
  normalizeCefrLevel, normalizeContentKind, normalizeContentStatus, normalizeRegister,
  parseIeltsSkills, parseUsageContext, stringifyListColumn,
} from "@/lib/vocabularyMeta";
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
  ipaV1: z.string().trim().optional(),
  ipaV2: z.string().trim().optional(),
  ipaV3: z.string().trim().optional(),
  term: z.string().trim().optional(),
  example: z.string().trim().optional(),
  wtype: z.string().trim().optional(),
  ipa: z.string().trim().optional(),
  // Optional, admin-curated depth metadata. Unknown values are dropped instead
  // of guessed, and an empty string clears the field.
  contentKind: z.string().trim().optional(),
  contentStatus: z.string().trim().optional(),
  register: z.string().trim().optional(),
  cefrLevel: z.string().trim().optional(),
  frequency: z.string().trim().max(24).optional(),
  ieltsRelevant: z.boolean().optional(),
  ieltsBandRelevance: z.string().trim().max(16).optional(),
  ieltsSkills: z.union([z.array(z.string()), z.string()]).optional(),
  usageContext: z.union([z.array(z.string()), z.string()]).optional(),
  notes: z.string().trim().max(2000).optional(),
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

  const { contentKind, contentStatus, register, cefrLevel, ieltsRelevant, ieltsSkills, usageContext, ...textFields } = parsed.data;
  const patch: Record<string, string | boolean | null> = {};
  for (const [key, value] of Object.entries(textFields)) {
    if (typeof value !== "string") continue;
    patch[key] = normalizeText(value);
  }
  if (contentKind !== undefined) patch.contentKind = normalizeContentKind(contentKind) ?? "word";
  if (contentStatus !== undefined) patch.contentStatus = normalizeContentStatus(contentStatus) ?? "approved";
  if (register !== undefined) patch.register = normalizeRegister(register);
  if (cefrLevel !== undefined) patch.cefrLevel = normalizeCefrLevel(cefrLevel);
  if (ieltsRelevant !== undefined) patch.ieltsRelevant = ieltsRelevant;
  if (ieltsSkills !== undefined) {
    patch.ieltsSkills = stringifyListColumn(parseIeltsSkills(Array.isArray(ieltsSkills) ? JSON.stringify(ieltsSkills) : ieltsSkills));
  }
  if (usageContext !== undefined) {
    patch.usageContext = stringifyListColumn(parseUsageContext(Array.isArray(usageContext) ? JSON.stringify(usageContext) : usageContext));
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Không có thay đổi." }, { status: 400 });

  const [updated] = await db.update(words).set(patch).where(eq(words.id, Number(params.id))).returning();
  return NextResponse.json({ word: updated });
}
