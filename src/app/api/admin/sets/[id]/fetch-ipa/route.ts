import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { words } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { fetchIpaBatch, isGeminiConfigured } from "@/lib/gemini";

const BATCH_SIZE = 40;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isGeminiConfigured()) {
    return NextResponse.json(
      { error: "Chưa cấu hình GEMINI_API_KEY trên server. Xem README để biết cách lấy API key miễn phí." },
      { status: 400 }
    );
  }

  const setId = Number(params.id);
  const body = await req.json().catch(() => ({}));
  const force = Boolean(body?.force);

  const allWords = await db.select().from(words).where(eq(words.setId, setId));
  const targetWords = force ? allWords : allWords.filter((w) =>
    w.term ? !w.ipa : Boolean(w.v1 && (!w.ipaV1 || !w.ipaV2 || !w.ipaV3))
  );

  if (targetWords.length === 0) {
    return NextResponse.json({ updated: 0, total: allWords.length, message: "Không có từ nào cần lấy phiên âm." });
  }

  let updated = 0;
  const errors: string[] = [];

  for (let i = 0; i < targetWords.length; i += BATCH_SIZE) {
    const chunk = targetWords.slice(i, i + BATCH_SIZE);
    const lookupTexts = Array.from(new Set(chunk.flatMap((w) =>
      w.term ? [w.term] : [w.v1, w.v2, w.v3]
    ).map((value) => (value || "").trim()).filter(Boolean)));
    if (lookupTexts.length === 0) continue;

    try {
      const result = await fetchIpaBatch(lookupTexts);
      for (const w of chunk) {
        if (w.term) {
          const ipa = result[w.term.trim()];
          if (!ipa) continue;
          await db.update(words).set({ ipa }).where(eq(words.id, w.id));
          updated++;
        } else {
          const patch = {
            ipaV1: result[(w.v1 || "").trim()] || w.ipaV1,
            ipaV2: result[(w.v2 || "").trim()] || w.ipaV2,
            ipaV3: result[(w.v3 || "").trim()] || w.ipaV3,
          };
          if (patch.ipaV1 || patch.ipaV2 || patch.ipaV3) {
            await db.update(words).set(patch).where(eq(words.id, w.id));
            updated++;
          }
        }
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "Lỗi không xác định.");
      break; // stop early on rate-limit / repeated errors instead of hammering further chunks
    }

    // Small pause between batches to stay comfortably under free-tier per-minute rate limits.
    if (i + BATCH_SIZE < targetWords.length) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  return NextResponse.json({ updated, total: targetWords.length, errors });
}

// Allow looking up which words in a set still lack IPA, for the "X/Y đã có phiên âm" progress display.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const setId = Number(params.id);
  const allWords = await db.select().from(words).where(eq(words.setId, setId));
  const withIpa = allWords.filter((w) => w.term ? Boolean(w.ipa) : Boolean(w.ipaV1 && w.ipaV2 && w.ipaV3)).length;
  return NextResponse.json({ total: allWords.length, withIpa });
}
