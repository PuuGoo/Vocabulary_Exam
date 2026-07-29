import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { words, vocabSets } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { fetchIpaSingle, isGeminiConfigured } from "@/lib/gemini";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isGeminiConfigured()) {
    return NextResponse.json(
      { error: "Chưa cấu hình GEMINI_API_KEY trên server." },
      { status: 400 }
    );
  }

  const word = await db.query.words.findFirst({ where: eq(words.id, Number(params.id)) });
  if (!word) return NextResponse.json({ error: "Không tìm thấy từ." }, { status: 404 });

  const set = await db.query.vocabSets.findFirst({ where: eq(vocabSets.id, word.setId) });
  const lookupTexts = set?.type === "irregular_verb"
    ? [word.v1, word.v2, word.v3].filter((value): value is string => Boolean(value))
    : [word.term || word.v1].filter((value): value is string => Boolean(value));
  if (lookupTexts.length === 0) return NextResponse.json({ error: "Từ này chưa có nội dung để tra phiên âm." }, { status: 400 });

  try {
    if (set?.type === "irregular_verb") {
      const [ipaV1, ipaV2, ipaV3] = await Promise.all(lookupTexts.map((text) => fetchIpaSingle(text)));
      if (!ipaV1 && !ipaV2 && !ipaV3) return NextResponse.json({ error: "Không lấy được phiên âm cho từ này." }, { status: 422 });
      await db.update(words).set({ ipaV1, ipaV2, ipaV3 }).where(eq(words.id, word.id));
      return NextResponse.json({ ipaV1, ipaV2, ipaV3, ipa: [ipaV1, ipaV2, ipaV3].filter(Boolean).join(" · ") });
    }
    const ipa = await fetchIpaSingle(lookupTexts[0]);
    if (!ipa) return NextResponse.json({ error: "Không lấy được phiên âm cho từ này." }, { status: 422 });
    await db.update(words).set({ ipa }).where(eq(words.id, word.id));
    return NextResponse.json({ ipa });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Lỗi không xác định." }, { status: 500 });
  }
}
