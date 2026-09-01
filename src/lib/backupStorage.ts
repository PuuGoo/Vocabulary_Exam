import { del, head, issueSignedToken, list, presignUrl, put } from "@vercel/blob";

export const BACKUP_BLOB_PREFIX = "backups/";
export const ADMIN_DOWNLOAD_TTL_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type StoredBackup = { pathname: string; filename: string; size: number; uploadedAt: string; etag: string };

export function safeStorageError(error: unknown) {
  const name = error instanceof Error ? error.name : "UnknownError";
  if (/Access|Unauthorized|Authentication/i.test(name)) return "Xác thực Vercel Blob thất bại.";
  if (/StoreNotFound/i.test(name)) return "Không tìm thấy Vercel Blob store đã kết nối.";
  if (/RateLimited/i.test(name)) return "Vercel Blob đang giới hạn tần suất yêu cầu.";
  if (/FileTooLarge/i.test(name)) return "File vượt giới hạn của Vercel Blob.";
  if (/Service|Network|RequestAborted/i.test(name)) return "Không thể kết nối dịch vụ Vercel Blob.";
  return `Vercel Blob operation failed (${name}).`;
}

export function isBackupStorageConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID));
}

export function assertBackupPathname(pathname: string) {
  if (!pathname.startsWith(BACKUP_BLOB_PREFIX) || pathname.includes("..") || !pathname.endsWith(".json.gz")) {
    throw new Error("Đường dẫn backup không hợp lệ.");
  }
  return pathname;
}

export function backupBlobPath(filename: string, createdAt: Date) {
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "-");
  const year = createdAt.getUTCFullYear();
  const month = String(createdAt.getUTCMonth() + 1).padStart(2, "0");
  return `${BACKUP_BLOB_PREFIX}${year}/${month}/${safeFilename}`;
}

export function retentionDays() {
  const parsed = Number(process.env.BACKUP_RETENTION_DAYS || 14);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 3650 ? parsed : 14;
}

export function emailLinkTtlDays() {
  const parsed = Number(process.env.BACKUP_EMAIL_LINK_TTL_DAYS || 7);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 7 ? parsed : 7;
}

export async function uploadPrivateBackup(input: { filename: string; buffer: Buffer; createdAt: Date }) {
  const pathname = backupBlobPath(input.filename, input.createdAt);
  const blob = await put(pathname, input.buffer, {
    access: "private", contentType: "application/gzip", addRandomSuffix: false,
    allowOverwrite: false, multipart: true, cacheControlMaxAge: 60,
  });
  return { pathname: blob.pathname, size: input.buffer.byteLength, uploadedAt: new Date(), etag: blob.etag };
}

export async function createPrivateBackupDownloadUrl(pathname: string, validUntil: number) {
  assertBackupPathname(pathname);
  const options = signedGetOptions(pathname, validUntil);
  const signedToken = await issueSignedToken(options.token);
  const { presignedUrl } = await presignUrl(signedToken, options.url);
  return presignedUrl;
}

export function signedGetOptions(pathname: string, validUntil: number) {
  assertBackupPathname(pathname);
  return {
    token: { pathname, operations: ["get"] as ["get"], validUntil },
    url: { pathname, operation: "get" as const, access: "private" as const, validUntil },
  };
}

export async function listStoredBackups(limit = 20): Promise<StoredBackup[]> {
  const found: StoredBackup[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: BACKUP_BLOB_PREFIX, limit: Math.min(1000, Math.max(limit, 20)), cursor });
    for (const blob of page.blobs) {
      if (blob.pathname.endsWith(".json.gz")) found.push({ pathname: blob.pathname, filename: blob.pathname.split("/").pop()!, size: blob.size, uploadedAt: blob.uploadedAt.toISOString(), etag: blob.etag });
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return found.sort((a, b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt)).slice(0, limit);
}

export async function verifyStoredBackup(pathname: string) {
  assertBackupPathname(pathname);
  return head(pathname);
}

export type RetentionDependencies = { listAll(): Promise<StoredBackup[]>; remove(pathnames: string[]): Promise<void> };

export async function cleanupOldBackups(newestPathname: string, now = new Date(), days = retentionDays(), deps?: RetentionDependencies) {
  const storage = deps || {
    listAll: async () => {
      const all: StoredBackup[] = []; let cursor: string | undefined;
      do {
        const page = await list({ prefix: BACKUP_BLOB_PREFIX, limit: 1000, cursor });
        all.push(...page.blobs.filter((blob) => blob.pathname.endsWith(".json.gz")).map((blob) => ({ pathname: blob.pathname, filename: blob.pathname.split("/").pop()!, size: blob.size, uploadedAt: blob.uploadedAt.toISOString(), etag: blob.etag })));
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return all;
    },
    remove: async (pathnames: string[]) => { if (pathnames.length) await del(pathnames); },
  };
  const cutoff = now.getTime() - days * DAY_MS;
  const expired = (await storage.listAll()).filter((blob) => blob.pathname.startsWith(BACKUP_BLOB_PREFIX) && blob.pathname !== newestPathname && Date.parse(blob.uploadedAt) < cutoff).map((blob) => blob.pathname);
  await storage.remove(expired);
  return expired;
}
