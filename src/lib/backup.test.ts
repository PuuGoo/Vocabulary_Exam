import assert from "node:assert/strict";
import test from "node:test";
import { backupFilename, sanitizeBackupUsers, serializeSubmissionFiles } from "./backup";

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
