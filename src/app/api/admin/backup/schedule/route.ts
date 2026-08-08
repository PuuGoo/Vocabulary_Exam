import { z } from "zod";
import { getSession } from "@/lib/auth";
import { createAndSendBackupEmail } from "@/lib/backupEmail";
import { getBackupEmailSchedule, saveBackupEmailSchedule } from "@/lib/backupSchedule";
import { isEmailConfigured } from "@/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const scheduleSchema = z.object({
  enabled: z.boolean(),
  recipient: z.string().trim().email("Email nhận không hợp lệ.").max(256),
  hour: z.number().int().min(0).max(23),
  timezone: z.literal("Asia/Ho_Chi_Minh"),
});

async function requireAdmin() {
  const session = await getSession();
  return session?.role === "admin" ? session : null;
}

export async function GET() {
  if (!await requireAdmin()) return Response.json({ error: "Bạn không có quyền xem lịch sao lưu." }, { status: 403 });
  return Response.json({
    schedule: await getBackupEmailSchedule(),
    emailConfigured: isEmailConfigured(),
    cronConfigured: Boolean(process.env.CRON_SECRET),
  });
}

export async function PUT(request: Request) {
  if (!await requireAdmin()) return Response.json({ error: "Bạn không có quyền sửa lịch sao lưu." }, { status: 403 });
  const parsed = scheduleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message || "Cấu hình không hợp lệ." }, { status: 400 });
  await saveBackupEmailSchedule(parsed.data);
  return Response.json({ ok: true, schedule: await getBackupEmailSchedule() });
}

export async function POST(request: Request) {
  if (!await requireAdmin()) return Response.json({ error: "Bạn không có quyền gửi bản sao lưu." }, { status: 403 });
  const body = await request.json().catch(() => null) as { recipient?: unknown } | null;
  const email = z.string().trim().email().max(256).safeParse(body?.recipient);
  if (!email.success) return Response.json({ error: "Email nhận không hợp lệ." }, { status: 400 });
  if (!isEmailConfigured()) return Response.json({ error: "SMTP chưa được cấu hình trên máy chủ." }, { status: 503 });
  const result = await createAndSendBackupEmail(email.data);
  if (!result.ok) return Response.json({ error: result.error }, { status: 502 });
  return Response.json({ ok: true, result });
}
