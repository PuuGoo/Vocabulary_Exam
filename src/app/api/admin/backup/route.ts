import { getSession } from "@/lib/auth";
import { createBackupExport } from "@/lib/backupExport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Bạn không có quyền sao lưu dữ liệu." }, { status: 403 });
  }

  const backup = await createBackupExport({ id: session.userId, username: session.username });
  return new Response(backup.body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": String(backup.byteLength),
      "Content-Disposition": `attachment; filename="${backup.filename}"`,
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
