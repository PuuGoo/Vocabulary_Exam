import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { mistakes, vocabSets, words } from "@/db/schema";
import { getSession } from "@/lib/auth";

const schema = z.object({ ids: z.array(z.number().int().positive()).min(1).max(1000) });
const moveSchema = schema.extend({ targetSetId: z.number().int().positive() });

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") return Response.json({ error: "Bạn không có quyền xóa từ." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Danh sách từ cần xóa không hợp lệ." }, { status: 400 });
  const deleted = await db.delete(words).where(inArray(words.id, [...new Set(parsed.data.ids)])).returning({ id: words.id });
  return Response.json({ ok: true, deleted: deleted.length });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") return Response.json({ error: "Bạn không có quyền di chuyển từ." }, { status: 403 });
  const parsed = moveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dữ liệu di chuyển không hợp lệ." }, { status: 400 });

  const ids = [...new Set(parsed.data.ids)];
  const [targetSet] = await db.select({ id: vocabSets.id, type: vocabSets.type, name: vocabSets.name })
    .from(vocabSets).where(eq(vocabSets.id, parsed.data.targetSetId)).limit(1);
  if (!targetSet) return Response.json({ error: "Không tìm thấy bộ từ đích." }, { status: 404 });

  const sourceWords = await db.select({ id: words.id, setId: words.setId, type: vocabSets.type })
    .from(words).innerJoin(vocabSets, eq(vocabSets.id, words.setId)).where(inArray(words.id, ids));
  if (sourceWords.length !== ids.length) return Response.json({ error: "Một số từ không còn tồn tại. Hãy tải lại bộ từ." }, { status: 409 });
  if (sourceWords.some((word) => word.type !== targetSet.type)) {
    return Response.json({ error: "Chỉ có thể di chuyển giữa hai bộ có cùng loại dữ liệu." }, { status: 400 });
  }
  if (sourceWords.every((word) => word.setId === targetSet.id)) {
    return Response.json({ error: "Các từ đã nằm trong bộ đích." }, { status: 400 });
  }

  await db.transaction(async (tx) => {
    await tx.update(words).set({ setId: targetSet.id }).where(inArray(words.id, ids));
    await tx.update(mistakes).set({ setId: targetSet.id }).where(inArray(mistakes.wordId, ids));
  });
  return Response.json({ ok: true, moved: ids.length, targetSet });
}