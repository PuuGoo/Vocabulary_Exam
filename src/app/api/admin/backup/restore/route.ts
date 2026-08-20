import { getSession } from "@/lib/auth";
import { runRestore } from "@/lib/restoreCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Bạn không có quyền khôi phục dữ liệu." }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => null) as { action?: unknown; confirmation?: unknown; backup?: unknown } | null;
    if (!body) return Response.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
    const action = typeof body.action === "string" ? body.action : "";
    const confirmation = typeof body.confirmation === "string" ? body.confirmation : "";
    const result = await runRestore(body.backup, action, confirmation);

    if (result.kind === "error") return Response.json({ error: result.error }, { status: 400 });
    if (result.kind === "preview") {
      return Response.json({
        createdAt: result.createdAt, version: result.version,
        integrity: result.integrity, counts: result.preview,
        unknownUsers: result.unknownUsers, strategy: "merge-only",
      });
    }
    return Response.json({ ok: true, report: result.report });
  } catch (error) {
    console.error("Backup restore failed", error);
    return Response.json({ error: "Không thể khôi phục dữ liệu. Mọi thay đổi đã được hoàn tác." }, { status: 400 });
  }
}
