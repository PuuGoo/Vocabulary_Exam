import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { vocabSets, words } from "@/db/schema";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { normalizeText } from "@/lib/text";
import { getFillPatternValidationError } from "@/lib/fillAnswer";
import { appendWord } from "@/lib/wordOrder.server";
import { canonicalizePinyinDisplay } from "@/lib/pinyin";

const verbSchema = z.object({
  meaning: z.string().trim().min(1),
  v1: z.string().trim().min(1),
  v2: z.string().trim().min(1),
  v3: z.string().trim().min(1),
  ipaV1: z.string().trim().optional(),
  ipaV2: z.string().trim().optional(),
  ipaV3: z.string().trim().optional(),
});
const vocabSchema = z.object({
  term: z.string().trim().min(1),
  meaning: z.string().trim().min(1),
  example: z.string().trim().optional(),
  wtype: z.string().trim().optional(),
  ipa: z.string().trim().optional(),
  alternateTerm: z.string().trim().optional(),
  pronunciation: z.string().trim().optional(),
  examplePronunciation: z.string().trim().optional(),
  exampleMeaning: z.string().trim().optional(),
  level: z.string().trim().optional(),
  classifier: z.string().trim().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireAdminPermission("vocab.create");
  if (isAuthorizationError(access)) return access;
  const setId = Number(params.id);
  const set = await db.query.vocabSets.findFirst({ where: eq(vocabSets.id, setId) });
  if (!set) return NextResponse.json({ error: "Không tìm thấy bộ từ vựng." }, { status: 404 });

  const body = await req.json().catch(() => null);

  if (set.type === "irregular_verb") {
    const parsed = verbSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Vui lòng điền đầy đủ nghĩa, V1, V2, V3." }, { status: 400 });
    const w = await db.transaction((tx) => appendWord(tx, setId, {
        setId,
        meaning: normalizeText(parsed.data.meaning),
        v1: normalizeText(parsed.data.v1),
        v2: normalizeText(parsed.data.v2),
        v3: normalizeText(parsed.data.v3),
        ipaV1: parsed.data.ipaV1 ? normalizeText(parsed.data.ipaV1) : null,
        ipaV2: parsed.data.ipaV2 ? normalizeText(parsed.data.ipaV2) : null,
        ipaV3: parsed.data.ipaV3 ? normalizeText(parsed.data.ipaV3) : null,
      }));
    return NextResponse.json({ word: w });
  } else {
    const parsed = vocabSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Vui lòng điền từ và nghĩa." }, { status: 400 });
    const patternError = getFillPatternValidationError(parsed.data.term, parsed.data.wtype);
    if (patternError) return NextResponse.json({ error: patternError }, { status: 400 });
    const w = await db.transaction((tx) => appendWord(tx, setId, {
        setId,
        meaning: normalizeText(parsed.data.meaning),
        term: normalizeText(parsed.data.term),
        example: normalizeText(parsed.data.example || ""),
        wtype: normalizeText(parsed.data.wtype || ""),
        ipa: parsed.data.ipa ? normalizeText(parsed.data.ipa) : null,
        alternateTerm: parsed.data.alternateTerm ? normalizeText(parsed.data.alternateTerm) : null,
        pronunciation: parsed.data.pronunciation ? (set.languageCode === "zh-CN" ? canonicalizePinyinDisplay(parsed.data.pronunciation) : normalizeText(parsed.data.pronunciation)) : null,
        examplePronunciation: parsed.data.examplePronunciation ? (set.languageCode === "zh-CN" ? canonicalizePinyinDisplay(parsed.data.examplePronunciation) : normalizeText(parsed.data.examplePronunciation)) : null,
        exampleMeaning: parsed.data.exampleMeaning ? normalizeText(parsed.data.exampleMeaning) : null,
        level: parsed.data.level ? normalizeText(parsed.data.level) : null,
        classifier: parsed.data.classifier ? normalizeText(parsed.data.classifier) : null,
      }));
    return NextResponse.json({ word: w });
  }
}
