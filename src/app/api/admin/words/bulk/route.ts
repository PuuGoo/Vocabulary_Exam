import { z } from "zod";
import { getSession } from "@/lib/auth";
import { deleteWordsAndNormalize, moveWordsToSet } from "@/lib/wordOrder.server";

const schema = z.object({ ids: z.array(z.number().int().positive()).min(1).max(1000) });
const moveSchema = schema.extend({ targetSetId: z.number().int().positive() });

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") return Response.json({ error: "Bạn không có quyền xóa từ." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Danh sách từ cần xóa không hợp lệ." }, { status: 400 });
  const result = await deleteWordsAndNormalize([...new Set(parsed.data.ids)]);
  if (result.kind === "stale") return Response.json({ error: "Danh sách từ đã thay đổi. Hãy tải lại trước khi xóa." }, { status: 409 });
  return Response.json({ ok: true, deleted: result.deleted });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") return Response.json({ error: "Bạn không có quyền di chuyển từ." }, { status: 403 });
  const parsed = moveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dữ liệu di chuyển không hợp lệ." }, { status: 400 });
  const result = await moveWordsToSet([...new Set(parsed.data.ids)], parsed.data.targetSetId);
  if (result.kind === "missing_target") return Response.json({ error: "Không tìm thấy bộ từ đích." }, { status: 404 });
  if (result.kind === "stale") return Response.json({ error: "Một số từ không còn tồn tại. Hãy tải lại bộ từ." }, { status: 409 });
  if (result.kind === "incompatible") return Response.json({ error: "Chỉ có thể di chuyển giữa hai bộ có cùng loại dữ liệu." }, { status: 400 });
  if (result.kind === "same_set") return Response.json({ error: "Các từ đã nằm trong bộ đích." }, { status: 400 });
  return Response.json({ ok: true, moved: result.moved, targetSet: { id: parsed.data.targetSetId } });
}
