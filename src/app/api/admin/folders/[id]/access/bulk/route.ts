import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { applyFolderAccessChanges } from "@/lib/folderAccessManagement";
import { requireAdminResourceAccess } from "@/lib/folderAuthorization";
import { FOLDER_ACCESS_LEVELS } from "@/lib/folderAuthorizationCore";

const schema = z.object({
  changes: z.array(z.object({
    userId: z.number().int().positive(),
    accessLevel: z.enum(FOLDER_ACCESS_LEVELS).nullable(),
  })).min(1).max(100),
}).superRefine((value, context) => {
  const ids = value.changes.map((change) => change.userId);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "Mỗi quản trị viên chỉ được xuất hiện một lần." });
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const folderId = Number(params.id);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!Number.isInteger(folderId) || folderId < 1 || !parsed.success) {
    return NextResponse.json({ error: "Danh sách thay đổi quyền không hợp lệ." }, { status: 400 });
  }
  const access = await requireAdminPermission("folders.share");
  if (isAuthorizationError(access)) return access;
  const scoped = await requireAdminResourceAccess({ permission: "folders.share", folderId, level: "manager", access });
  if (scoped instanceof NextResponse) return scoped;

  const result = await applyFolderAccessChanges(access, folderId, parsed.data.changes);
  if (!result.ok) {
    const status = result.code === "FOLDER_NOT_FOUND" ? 404 : result.code === "PROTECTED_TARGET" ? 409 : 400;
    return NextResponse.json({
      error: result.code === "PROTECTED_TARGET"
        ? "Không thể thay đổi quyền của chủ sở hữu, chính bạn hoặc System Owner."
        : "Một hoặc nhiều quản trị viên không còn hợp lệ. Không có thay đổi nào được lưu.",
      code: result.code,
      userIds: result.userIds,
    }, { status });
  }
  return NextResponse.json({ ok: true, changed: result.changed });
}
