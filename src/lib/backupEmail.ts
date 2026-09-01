import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { createBackupExport } from "@/lib/backupExport";
import { cleanupOldBackups, createPrivateBackupDownloadUrl, emailLinkTtlDays, safeStorageError, uploadPrivateBackup } from "@/lib/backupStorage";
import { sendBackupLinkEmail } from "@/lib/mailer";

export type BackupEmailStage = "backup" | "compress" | "storage" | "signed-url" | "smtp";
export type BackupEmailResult =
  | { ok: true; filename: string; pathname: string; compressedBytes: number; originalBytes: number; checksum: string; expiresAt: string }
  | { ok: false; stage: BackupEmailStage; error: string };

type BackupExport = Awaited<ReturnType<typeof createBackupExport>>;
export type BackupPipelineDependencies = {
  upload(input: { filename: string; buffer: Buffer; createdAt: Date }): Promise<{ pathname: string; size: number; uploadedAt: Date; etag: string }>;
  sign(pathname: string, validUntil: number): Promise<string>;
  send(input: Parameters<typeof sendBackupLinkEmail>[0]): Promise<{ ok: boolean; error?: string }>;
  cleanup(pathname: string): Promise<unknown>;
  now(): Date;
};

const productionDependencies: BackupPipelineDependencies = {
  upload: uploadPrivateBackup, sign: createPrivateBackupDownloadUrl, send: sendBackupLinkEmail,
  cleanup: cleanupOldBackups, now: () => new Date(),
};

export async function storeAndSendBackupLink(to: string, backup: BackupExport, options: { logStages?: boolean; dependencies?: BackupPipelineDependencies } = {}): Promise<BackupEmailResult> {
  const deps = options.dependencies || productionDependencies;
  let compressed: Buffer;
  try {
    if (options.logStages) console.log("[backup-cron] gzip");
    compressed = gzipSync(Buffer.from(backup.body, "utf8"), { level: 9 });
    if (options.logStages) console.log("[backup-cron] backup compressed", { bytes: compressed.byteLength });
  } catch (error) {
    console.error("[backup-email] gzip failed", error instanceof Error ? error.message : error);
    return { ok: false, stage: "compress", error: "Không thể nén bản sao lưu." };
  }

  const filename = backup.filename.replace(/\.json$/i, ".json.gz");
  const checksum = createHash("sha256").update(compressed).digest("hex");
  let stored: Awaited<ReturnType<BackupPipelineDependencies["upload"]>>;
  try {
    if (options.logStages) console.log("[backup-cron] storage-upload");
    stored = await deps.upload({ filename, buffer: compressed, createdAt: backup.createdAt });
    if (options.logStages) console.log("[backup-cron] storage-uploaded", { pathname: stored.pathname, bytes: stored.size });
  } catch (error) {
    console.error("[backup-storage] upload failed", safeStorageError(error));
    return { ok: false, stage: "storage", error: "Lưu backup lên bộ nhớ đám mây thất bại. Hãy kiểm tra Private Blob trên Vercel." };
  }

  try { await deps.cleanup(stored.pathname); }
  catch (error) { console.warn("[backup-storage] retention cleanup failed", safeStorageError(error)); }

  const expiresAt = new Date(deps.now().getTime() + emailLinkTtlDays() * 24 * 60 * 60 * 1000);
  let downloadUrl: string;
  try {
    downloadUrl = await deps.sign(stored.pathname, expiresAt.getTime());
    if (options.logStages) console.log("[backup-cron] signed-url-created", { pathname: stored.pathname, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    console.error("[backup-storage] signed URL failed", safeStorageError(error));
    return { ok: false, stage: "signed-url", error: "Không thể tạo liên kết tải backup riêng tư." };
  }

  const recordCount = Object.values(backup.counts).reduce((sum, count) => sum + count, 0);
  if (options.logStages) console.log("[backup-cron] smtp-send");
  const mailed = await deps.send({ to, filename, downloadUrl, createdAt: backup.createdAt, recordCount, compressedBytes: compressed.byteLength, checksum, expiresAt });
  if (!mailed.ok) return { ok: false, stage: "smtp", error: mailed.error || "Gửi email qua SMTP thất bại." };
  return { ok: true, filename, pathname: stored.pathname, compressedBytes: compressed.byteLength, originalBytes: backup.byteLength, checksum, expiresAt: expiresAt.toISOString() };
}

export async function createAndSendBackupEmail(to: string, options: { logStages?: boolean; dependencies?: BackupPipelineDependencies } = {}): Promise<BackupEmailResult> {
  let backup: BackupExport;
  try {
    if (options.logStages) console.log("[backup-cron] backup-create");
    backup = await createBackupExport();
  } catch (error) {
    console.error("[backup-email] backup create failed", error instanceof Error ? error.message : error);
    return { ok: false, stage: "backup", error: "Không thể tạo bản sao lưu từ cơ sở dữ liệu. Hãy kiểm tra DATABASE_URL và log function trên Vercel." };
  }
  return storeAndSendBackupLink(to, backup, options);
}
