import { getSession } from "@/lib/auth";
import { createBackupExport } from "@/lib/backupExport";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const access = await requireAdminPermission("backup.create");
  if (isAuthorizationError(access)) return access;
  const backup = await createBackupExport({ id: access.userId, username: access.username });
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
