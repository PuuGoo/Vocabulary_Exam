import { z } from "zod";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { reorderWords } from "@/lib/wordOrder.server";
import { db } from "@/db";
import { vocabSets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdminResourceAccess } from "@/lib/folderAuthorization";

const schema = z.object({
  orderedIds: z.array(z.number().int().positive()).max(10_000),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const access = await requireAdminPermission("vocab.reorder");
  if (isAuthorizationError(access)) return access;
  const setId = Number(params.id);
  if (!Number.isInteger(setId) || setId < 1) return Response.json({ error: "Không tìm thấy bộ từ." }, { status: 404 });
  const set = await db.query.vocabSets.findFirst({ where: eq(vocabSets.id, setId) });
  const scoped = await requireAdminResourceAccess({ permission: "vocab.reorder", folderId: set?.folderId, level: "editor", access });
  if (isAuthorizationError(scoped)) return scoped;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || new Set(parsed.data.orderedIds).size !== parsed.data.orderedIds.length) {
    return Response.json({ error: "Thứ tự từ vựng không hợp lệ." }, { status: 400 });
  }
  const result = await reorderWords(setId, parsed.data.orderedIds);
  if (result.kind === "missing_set") return Response.json({ error: "Không tìm thấy bộ từ." }, { status: 404 });
  if (result.kind === "stale") return Response.json({ error: "Danh sách từ đã thay đổi. Hãy tải lại trước khi sắp xếp." }, { status: 409 });
  if (result.kind === "invalid") return Response.json({ error: "Thứ tự từ vựng không hợp lệ." }, { status: 400 });
  return Response.json({ ok: true, orderedIds: parsed.data.orderedIds });
}
