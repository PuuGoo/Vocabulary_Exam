import { eq } from "drizzle-orm";
import { db } from "@/db";
import { vocabSets } from "@/db/schema";
import type { ShareTargetType } from "@/lib/shares";

export async function getShareTargetFolderId(targetType: ShareTargetType, targetId: number) {
  if (targetType === "question_collection") return targetId;
  const [set] = await db.select({ folderId: vocabSets.folderId }).from(vocabSets).where(eq(vocabSets.id, targetId)).limit(1);
  return set?.folderId ?? null;
}
