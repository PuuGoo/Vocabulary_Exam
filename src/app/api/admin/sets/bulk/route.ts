import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { vocabSets } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { formatCategorySetName } from "@/lib/categorySequence";

const deleteSchema = z.object({ action: z.literal("delete"), ids: z.array(z.number().int().positive()).min(1).max(500) });
const reorderSchema = z.object({
  action: z.literal("reorder"),
  category: z.string().trim().min(1).max(128),
  orderedIds: z.array(z.number().int().positive()).min(1).max(500),
});
const requestSchema = z.discriminatedUnion("action", [deleteSchema, reorderSchema]);

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") return Response.json({ error: "Bạn không có quyền thực hiện thao tác này." }, { status: 403 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dữ liệu thao tác hàng loạt không hợp lệ." }, { status: 400 });

  if (parsed.data.action === "delete") {
    const uniqueIds = [...new Set(parsed.data.ids)];
    const deleted = await db.delete(vocabSets).where(inArray(vocabSets.id, uniqueIds)).returning({ id: vocabSets.id });
    return Response.json({ ok: true, deleted: deleted.length });
  }

  const category = parsed.data.category;
  const orderedIds = [...new Set(parsed.data.orderedIds)];
  if (orderedIds.length !== parsed.data.orderedIds.length) return Response.json({ error: "Danh sách thứ tự có bộ từ trùng nhau." }, { status: 400 });

  const rows = await db.select({ id: vocabSets.id, name: vocabSets.name })
    .from(vocabSets)
    .where(eq(vocabSets.category, category));
  const requestedIds = new Set(orderedIds);
  if (rows.length !== orderedIds.length || rows.some((row) => !requestedIds.has(row.id))) {
    return Response.json({ error: "Danh sách bộ từ không còn khớp với thư mục hiện tại. Hãy tải lại trang." }, { status: 409 });
  }

  const byId = new Map(rows.map((row) => [row.id, row]));
  const sets = await db.transaction(async (tx) => {
    for (let index = 0; index < orderedIds.length; index += 1) {
      const current = byId.get(orderedIds[index])!;
      await tx.update(vocabSets)
        .set({ name: formatCategorySetName(index + 1, current.name) })
        .where(eq(vocabSets.id, current.id));
    }
    return tx.select().from(vocabSets).where(eq(vocabSets.category, category));
  });

  return Response.json({ ok: true, sets });
}
