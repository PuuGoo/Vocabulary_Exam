import { getSession } from "@/lib/auth";
import { isBackupStorageConfigured, listStoredBackups, safeStorageError } from "@/lib/backupStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (session?.role !== "admin") return Response.json({ error: "Bạn không có quyền xem backup đám mây." }, { status: 403 });
  if (!isBackupStorageConfigured()) return Response.json({ configured: false, backups: [] });
  try { return Response.json({ configured: true, backups: await listStoredBackups(20) }); }
  catch (error) {
    console.error("[backup-storage] list failed", safeStorageError(error));
    return Response.json({ configured: true, error: "Không thể đọc danh sách backup đám mây." }, { status: 502 });
  }
}
