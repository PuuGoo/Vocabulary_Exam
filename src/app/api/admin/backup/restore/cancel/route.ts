import { getSession } from "@/lib/auth";
import { deleteSession } from "@/lib/restoreSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Bạn không có quyền." }, { status: 403 });
  }
  const body = await request.json().catch(() => null) as { sessionId?: unknown } | null;
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  if (!sessionId) return Response.json({ error: "Thiếu sessionId." }, { status: 400 });
  await deleteSession(sessionId).catch(() => undefined);
  return Response.json({ ok: true });
}
