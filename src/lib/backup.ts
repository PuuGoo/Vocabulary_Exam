export const BACKUP_FORMAT = "lexora-backup";
export const BACKUP_VERSION = 2;
export const SUPPORTED_BACKUP_VERSIONS = [1, BACKUP_VERSION] as const;

export const BACKUP_COLLECTIONS = [
  "users", "classes", "classMembers", "vocabCategories", "categoryDocuments", "vocabSets", "words", "attempts",
  "assignments", "assignmentExtensions", "assignmentSubmissions", "teachBackNotes",
  "mistakes", "wordProgress", "wordBookmarks", "studySessions", "learningGoals",
  "dailyActivities",
  "appSettings",
] as const;

export type BackupCollection = (typeof BACKUP_COLLECTIONS)[number];
export type BackupRow = Record<string, unknown>;
export type BackupData = Record<BackupCollection, BackupRow[]>;
export type BackupDocument = {
  format: typeof BACKUP_FORMAT;
  version: (typeof SUPPORTED_BACKUP_VERSIONS)[number];
  createdAt: string;
  integrity?: { algorithm: "SHA-256"; checksum: string };
  data: BackupData;
};

export function parseBackupDocument(value: unknown): BackupDocument {
  if (!value || typeof value !== "object") throw new Error("File JSON không hợp lệ.");
  const document = value as Record<string, unknown>;
  if (document.format !== BACKUP_FORMAT) throw new Error("Đây không phải file sao lưu của Lexora.");
  if (!SUPPORTED_BACKUP_VERSIONS.includes(document.version as (typeof SUPPORTED_BACKUP_VERSIONS)[number])) {
    throw new Error("Phiên bản file sao lưu chưa được hỗ trợ.");
  }
  if (typeof document.createdAt !== "string" || Number.isNaN(Date.parse(document.createdAt))) {
    throw new Error("File sao lưu thiếu thời gian tạo hợp lệ.");
  }
  if (!document.data || typeof document.data !== "object") throw new Error("File sao lưu không có dữ liệu.");
  const rawData = document.data as Record<string, unknown>;
  const data = {} as BackupData;
  for (const collection of BACKUP_COLLECTIONS) {
    const rows = rawData[collection];
    // These collections were added after v1, so older backups remain restorable.
    if ((collection === "vocabCategories" || collection === "categoryDocuments" || collection === "appSettings") && rows === undefined) {
      data[collection] = [];
      continue;
    }
    if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
      throw new Error(`Nhóm dữ liệu ${collection} không hợp lệ.`);
    }
    data[collection] = rows as BackupRow[];
  }
  let integrity: BackupDocument["integrity"];
  if (document.version === BACKUP_VERSION) {
    const rawIntegrity = document.integrity as Record<string, unknown> | undefined;
    if (rawIntegrity?.algorithm !== "SHA-256" || typeof rawIntegrity.checksum !== "string" || !/^[a-f0-9]{64}$/i.test(rawIntegrity.checksum)) {
      throw new Error("File sao lưu thiếu mã kiểm tra toàn vẹn.");
    }
    integrity = { algorithm: "SHA-256", checksum: rawIntegrity.checksum.toLowerCase() };
  }
  return {
    format: BACKUP_FORMAT,
    version: document.version as BackupDocument["version"],
    createdAt: document.createdAt,
    integrity,
    data,
  };
}

export function getBackupCounts(document: BackupDocument) {
  return Object.fromEntries(BACKUP_COLLECTIONS.map((name) => [name, document.data[name].length])) as Record<BackupCollection, number>;
}

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

export const serializeCategoryDocuments = serializeSubmissionFiles;

export function backupFilename(now = new Date()) {
  return `lexora-backup-${now.toISOString().replace(/[:.]/g, "-")}.json`;
}
