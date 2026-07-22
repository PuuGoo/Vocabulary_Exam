import assert from "node:assert/strict";
import test from "node:test";
import { BACKUP_COLLECTIONS, backupFilename, getBackupCounts, parseBackupDocument, sanitizeBackupUsers, serializeSubmissionFiles } from "./backup";

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

test("restore validator accepts a complete Lexora backup", () => {
  const data = Object.fromEntries(BACKUP_COLLECTIONS.map((name) => [name, []])) as Record<string, Array<Record<string, unknown>>>;
  data.words = [{ id: 1, meaning: "bữa ăn" }];
  const backup = parseBackupDocument({ format: "lexora-backup", version: 1, createdAt: "2026-07-22T00:00:00.000Z", data });
  assert.equal(getBackupCounts(backup).words, 1);
});

test("restore validator rejects incomplete and foreign JSON files", () => {
  assert.throws(() => parseBackupDocument({ format: "other", version: 1, createdAt: new Date().toISOString(), data: {} }), /Lexora/);
  assert.throws(() => parseBackupDocument({ format: "lexora-backup", version: 1, createdAt: new Date().toISOString(), data: {} }), /users/);
});
