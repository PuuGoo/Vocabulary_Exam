import { gzipSync } from "node:zlib";
import { createBackupExport } from "@/lib/backupExport";
import { sendBackupEmail } from "@/lib/mailer";
import { backupAttachmentError } from "@/lib/backupEmailAttachment";

export type BackupEmailStage = "backup" | "compress" | "attachment" | "smtp";
export type BackupEmailResult = { ok: true; filename: string; compressedBytes: number; originalBytes: number } | { ok: false; stage: BackupEmailStage; error: string };

export async function createAndSendBackupEmail(to: string): Promise<BackupEmailResult> {
  let backup: Awaited<ReturnType<typeof createBackupExport>>;
  try { backup = await createBackupExport(); }
  catch (error) {
    console.error("createBackupExport failed:", error instanceof Error ? error.message : error);
    return { ok: false, stage: "backup", error: "Không thể tạo bản sao lưu từ cơ sở dữ liệu. Hãy kiểm tra DATABASE_URL và log function trên Vercel." };
  }
  let compressed: Buffer;
  try { compressed = gzipSync(Buffer.from(backup.body, "utf8"), { level: 9 }); }
  catch (error) {
    console.error("gzip backup failed:", error instanceof Error ? error.message : error);
    return { ok: false, stage: "compress", error: "Không thể nén bản sao lưu." };
  }
  const attachmentError = backupAttachmentError(compressed.byteLength);
  if (attachmentError) return { ok: false, stage: "attachment", error: attachmentError };
  const filename = backup.filename.replace(/\.json$/i, ".json.gz");
  const recordCount = Object.values(backup.counts).reduce((sum, count) => sum + count, 0);
  const result = await sendBackupEmail({ to, attachment: compressed, filename, createdAt: backup.createdAt, recordCount });
  if (!result.ok) return { ok: false, stage: "smtp", error: result.error || "Gửi email qua SMTP thất bại." };
  return { ok: true, filename, compressedBytes: compressed.byteLength, originalBytes: backup.byteLength };
}
