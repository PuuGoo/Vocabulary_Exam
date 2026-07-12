import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { vocabSets, words } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { normalizeText } from "@/lib/text";

const verbSchema = z.object({
  meaning: z.string().trim().min(1),
  v1: z.string().trim().min(1),
  v2: z.string().trim().min(1),
  v3: z.string().trim().min(1),
});
const vocabSchema = z.object({
  term: z.string().trim().min(1),
  meaning: z.string().trim().min(1),
  example: z.string().trim().optional(),
  wtype: z.string().trim().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const setId = Number(params.id);
  const set = await db.query.vocabSets.findFirst({ where: eq(vocabSets.id, setId) });
  if (!set) return NextResponse.json({ error: "Không tìm thấy bộ từ vựng." }, { status: 404 });

  const body = await req.json().catch(() => null);

  if (set.type === "irregular_verb") {
    const parsed = verbSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Vui lòng điền đầy đủ nghĩa, V1, V2, V3." }, { status: 400 });
    const [w] = await db
      .insert(words)
      .values({
        setId,
        meaning: normalizeText(parsed.data.meaning),
        v1: normalizeText(parsed.data.v1),
        v2: normalizeText(parsed.data.v2),
        v3: normalizeText(parsed.data.v3),
      })
      .returning();
    return NextResponse.json({ word: w });
  } else {
    const parsed = vocabSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Vui lòng điền từ và nghĩa." }, { status: 400 });
    const [w] = await db
      .insert(words)
      .values({
        setId,
        meaning: normalizeText(parsed.data.meaning),
        term: normalizeText(parsed.data.term),
        example: normalizeText(parsed.data.example || ""),
        wtype: normalizeText(parsed.data.wtype || ""),
      })
      .returning();
    return NextResponse.json({ word: w });
  }
}
