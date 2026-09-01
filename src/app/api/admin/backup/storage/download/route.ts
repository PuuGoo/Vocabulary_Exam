import { z } from "zod";
import { getSession } from "@/lib/auth";
import { ADMIN_DOWNLOAD_TTL_MS, assertBackupPathname, createPrivateBackupDownloadUrl, safeStorageError, verifyStoredBackup } from "@/lib/backupStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ pathname: z.string().min(1).max(1024) });

export async function POST(request: Request) {
  const session = await getSession();
  if (session?.role !== "admin") return Response.json({ error: "Bạn không có quyền tải backup đám mây." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Đường dẫn backup không hợp lệ." }, { status: 400 });
  try {
    const pathname = assertBackupPathname(parsed.data.pathname);
    const blob = await verifyStoredBackup(pathname);
    if (!blob) return Response.json({ error: "Không tìm thấy backup." }, { status: 404 });
    const expiresAt = new Date(Date.now() + ADMIN_DOWNLOAD_TTL_MS);
    const url = await createPrivateBackupDownloadUrl(pathname, expiresAt.getTime());
    return Response.json({ url, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    console.error("[backup-storage] admin download link failed", safeStorageError(error));
    const message = error instanceof Error && error.message === "Đường dẫn backup không hợp lệ." ? error.message : "Không thể tạo liên kết tải backup.";
    return Response.json({ error: message }, { status: message.includes("không hợp lệ") ? 400 : 502 });
  }
}
