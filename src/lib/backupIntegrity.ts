import { createHash, timingSafeEqual } from "node:crypto";
import type { BackupData } from "@/lib/backup";

export function createBackupChecksum(data: BackupData) {
  return createHash("sha256").update(JSON.stringify(data), "utf8").digest("hex");
}

export function verifyBackupChecksum(data: BackupData, expected: string) {
  const actual = Buffer.from(createBackupChecksum(data), "hex");
  const supplied = Buffer.from(expected, "hex");
  return actual.length === supplied.length && timingSafeEqual(actual, supplied);
}
