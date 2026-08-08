import { gzipSync } from "node:zlib";
import { createBackupExport } from "@/lib/backupExport";
import { sendBackupEmail } from "@/lib/mailer";

const MAX_EMAIL_ATTACHMENT_BYTES = 18 * 1024 * 1024;

export async function createAndSendBackupEmail(to: string) {
  const backup = await createBackupExport();
  const compressed = gzipSync(Buffer.from(backup.body, "utf8"), { level: 9 });
  if (compressed.byteLength > MAX_EMAIL_ATTACHMENT_BYTES) {
    return {
      ok: false as const,
      error: `Bản sao lưu sau khi nén vẫn lớn hơn 18 MB (${(compressed.byteLength / 1024 / 1024).toFixed(1)} MB). Hãy tải thủ công hoặc chuyển sang lưu trữ đám mây.`,
    };
  }
  const filename = backup.filename.replace(/\.json$/i, ".json.gz");
  const recordCount = Object.values(backup.counts).reduce((sum, count) => sum + count, 0);
  const result = await sendBackupEmail({ to, attachment: compressed, filename, createdAt: backup.createdAt, recordCount });
  return { ...result, filename, compressedBytes: compressed.byteLength, originalBytes: backup.byteLength };
}
