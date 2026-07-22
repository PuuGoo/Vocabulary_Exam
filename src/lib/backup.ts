export const BACKUP_FORMAT = "lexora-backup";
export const BACKUP_VERSION = 1;

type UserWithPassword = Record<string, unknown> & { passwordHash?: unknown };
type SubmissionWithFile = Record<string, unknown> & { fileData?: Buffer | Uint8Array | null };

export function sanitizeBackupUsers(rows: UserWithPassword[]) {
  return rows.map(({ passwordHash: _passwordHash, ...safeUser }) => safeUser);
}

export function serializeSubmissionFiles(rows: SubmissionWithFile[]) {
  return rows.map(({ fileData, ...submission }) => ({
    ...submission,
    fileDataBase64: fileData ? Buffer.from(fileData).toString("base64") : null,
  }));
}

export function backupFilename(now = new Date()) {
  return `lexora-backup-${now.toISOString().replace(/[:.]/g, "-")}.json`;
}
