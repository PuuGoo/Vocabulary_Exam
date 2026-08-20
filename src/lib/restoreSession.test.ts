import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const sandbox = mkdtempSync(join(tmpdir(), "lexora-restore-test-"));
process.env.TMPDIR = sandbox;
process.env.TMP = sandbox;
process.env.TEMP = sandbox;

// Use require() so the module picks up the env vars we just set.
const { CHUNK_SIZE, appendChunk, assembleSession, createSession, deleteSession, maxRestoreBytes, readSession } = require("./restoreSession");

test("createSession returns a unique session id", async () => {
  const first = await createSession(2, "test.json");
  const second = await createSession(2, "test.json");
  assert.notEqual(first.id, second.id);
  assert.equal(first.meta.expectedChunks, 2);
  await deleteSession(first.id);
  await deleteSession(second.id);
});

test("appendChunk tracks received count and total bytes", async () => {
  const { id } = await createSession(3, "test.json");
  await appendChunk(id, 0, Buffer.from("hello"));
  await appendChunk(id, 1, Buffer.from("world!"));
  const meta = await readSession(id);
  assert.equal(meta?.receivedChunks, 2);
  assert.equal(meta?.totalBytes, 11);
  await deleteSession(id);
});

test("assembleSession rejects when chunks are missing", async () => {
  const { id } = await createSession(2, "test.json");
  await appendChunk(id, 0, Buffer.from("only-one"));
  await assert.rejects(() => assembleSession(id), /Chưa nhận đủ/);
  await deleteSession(id);
});

test("assembleSession concatenates chunks in order", async () => {
  const { id } = await createSession(3, "test.json");
  await appendChunk(id, 0, Buffer.from("AAA"));
  await appendChunk(id, 1, Buffer.from("BBB"));
  await appendChunk(id, 2, Buffer.from("CCC"));
  const combined = await assembleSession(id);
  assert.equal(combined.toString("utf8"), "AAABBBCCC");
  await deleteSession(id);
});

test("chunk size and restore cap are stable", () => {
  assert.ok(CHUNK_SIZE > 0);
  assert.ok(maxRestoreBytes() > CHUNK_SIZE * 100);
});
