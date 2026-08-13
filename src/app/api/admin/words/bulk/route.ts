import { inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { words } from "@/db/schema";
import { getSession } from "@/lib/auth";

const schema = z.object({ ids: z.array(z.number().int().positive()).min(1).max(1000) });

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") return Response.json({ error: "Bạn không có quyền xóa từ." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Danh sách từ cần xóa không hợp lệ." }, { status: 400 });
  const deleted = await db.delete(words).where(inArray(words.id, [...new Set(parsed.data.ids)])).returning({ id: words.id });
  return Response.json({ ok: true, deleted: deleted.length });
}
