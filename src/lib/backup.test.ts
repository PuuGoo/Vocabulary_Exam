import assert from "node:assert/strict";
import test from "node:test";
import { BACKUP_COLLECTIONS, backupFilename, getBackupCounts, parseBackupDocument, sanitizeBackupUsers, serializeSubmissionFiles } from "./backup";
import { createBackupChecksum, verifyBackupChecksum } from "./backupIntegrity";
import { isBackupWindowOpen, isStaleBackupAttempt, zonedScheduleParts } from "./backupScheduleTime";

test("backup removes password hashes while preserving account metadata", () => {
  const [user] = sanitizeBackupUsers([{ id: 1, username: "admin", passwordHash: "secret-hash", role: "admin" }]);
  assert.deepEqual(user, { id: 1, username: "admin", role: "admin" });
  assert.equal("passwordHash" in user, false);
});

test("backup encodes submitted files as base64", () => {
  const [submission] = serializeSubmissionFiles([{ id: 4, fileName: "answer.txt", fileData: Buffer.from("hello") }]);
  assert.equal(submission.fileDataBase64, "aGVsbG8=");
  assert.equal("fileData" in submission, false);
});

test("backup filenames are deterministic and filesystem safe", () => {
  assert.equal(backupFilename(new Date("2026-07-22T12:34:56.789Z")), "lexora-backup-2026-07-22T12-34-56-789Z.json");
});

test("restore validator accepts a complete legacy Lexora backup", () => {
  const data = Object.fromEntries(BACKUP_COLLECTIONS.map((name) => [name, []])) as Record<string, Array<Record<string, unknown>>>;
  delete data.appSettings;
  data.words = [{ id: 1, meaning: "bữa ăn" }];
  const backup = parseBackupDocument({ format: "lexora-backup", version: 1, createdAt: "2026-07-22T00:00:00.000Z", data });
  assert.equal(getBackupCounts(backup).words, 1);
  assert.equal(getBackupCounts(backup).appSettings, 0);
});

test("v2 backup requires a SHA-256 integrity manifest", () => {
  const data = Object.fromEntries(BACKUP_COLLECTIONS.map((name) => [name, []]));
  assert.throws(
    () => parseBackupDocument({ format: "lexora-backup", version: 2, createdAt: new Date().toISOString(), data }),
    /toàn vẹn/,
  );
  const backup = parseBackupDocument({
    format: "lexora-backup",
    version: 2,
    createdAt: new Date().toISOString(),
    integrity: { algorithm: "SHA-256", checksum: "a".repeat(64) },
    data,
  });
  assert.equal(backup.version, 2);
  assert.equal(backup.integrity?.checksum, "a".repeat(64));
});

test("checksum detects changed backup data", () => {
  const data = Object.fromEntries(BACKUP_COLLECTIONS.map((name) => [name, []])) as unknown as Parameters<typeof createBackupChecksum>[0];
  data.words = [{ id: 1, term: "meal" }];
  const checksum = createBackupChecksum(data);
  assert.equal(checksum.length, 64);
  assert.equal(verifyBackupChecksum(data, checksum), true);
  data.words[0].term = "changed";
  assert.equal(verifyBackupChecksum(data, checksum), false);
});

test("email backup schedule uses Vietnam local date and hour", () => {
  assert.deepEqual(zonedScheduleParts(new Date("2026-08-08T13:15:00.000Z"), "Asia/Ho_Chi_Minh"), {
    date: "2026-08-08",
    hour: 20,
  });
});

test("email backup can retry after the configured hour but never before it", () => {
  assert.equal(isBackupWindowOpen(19, 20), false);
  assert.equal(isBackupWindowOpen(20, 20), true);
  assert.equal(isBackupWindowOpen(23, 20), true);
});

test("a crashed scheduled backup claim becomes retryable after 90 minutes", () => {
  const now = new Date("2026-08-13T12:00:00.000Z");
  assert.equal(isStaleBackupAttempt("2026-08-13T10:29:59.000Z", "running", now), true);
  assert.equal(isStaleBackupAttempt("2026-08-13T10:31:00.000Z", "running", now), false);
  assert.equal(isStaleBackupAttempt("2026-08-13T09:00:00.000Z", "success", now), false);
});

test("restore validator rejects incomplete and foreign JSON files", () => {
  assert.throws(() => parseBackupDocument({ format: "other", version: 1, createdAt: new Date().toISOString(), data: {} }), /Lexora/);
  assert.throws(() => parseBackupDocument({ format: "lexora-backup", version: 1, createdAt: new Date().toISOString(), data: {} }), /users/);
});
