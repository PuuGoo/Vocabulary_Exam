import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const SESSION_ROOT = path.join(process.env.TMPDIR || process.env.TMP || process.env.TEMP || "/tmp", "lexora-restore");

export const CHUNK_SIZE = 1_500_000; // 1.5 MB to fit well under Vercel's 4.5 MB body limit.

type SessionMetadata = {
  id: string;
  createdAt: number;
  expectedChunks: number;
  receivedChunks: number;
  totalBytes: number;
  originalName: string;
};

async function ensureRoot() {
  await mkdir(SESSION_ROOT, { recursive: true });
}

function sessionDir(id: string) {
  return path.join(SESSION_ROOT, id);
}

function metadataPath(id: string) {
  return path.join(sessionDir(id), "meta.json");
}

export async function createSession(expectedChunks: number, originalName: string) {
  await ensureRoot();
  const id = randomBytes(16).toString("hex");
  const meta: SessionMetadata = {
    id,
    createdAt: Date.now(),
    expectedChunks,
    receivedChunks: 0,
    totalBytes: 0,
    originalName,
  };
  await mkdir(sessionDir(id), { recursive: true });
  await writeFile(metadataPath(id), JSON.stringify(meta), "utf8");
  return { id, meta };
}

export async function readSession(id: string): Promise<SessionMetadata | null> {
  try {
    const raw = await readFile(metadataPath(id), "utf8");
    return JSON.parse(raw) as SessionMetadata;
  } catch {
    return null;
  }
}

async function writeMeta(meta: SessionMetadata) {
  await writeFile(metadataPath(meta.id), JSON.stringify(meta), "utf8");
}

export async function appendChunk(id: string, index: number, body: Buffer) {
  const meta = await readSession(id);
  if (!meta) throw new Error("Phiên khôi phục không tồn tại hoặc đã hết hạn.");
  if (index < 0 || index >= meta.expectedChunks) throw new Error("Chỉ số phân đoạn không hợp lệ.");
  const chunkPath = path.join(sessionDir(id), `${index}.part`);
  await writeFile(chunkPath, body);
  meta.receivedChunks += 1;
  meta.totalBytes += body.byteLength;
  await writeMeta(meta);
  return meta;
}

export async function assembleSession(id: string): Promise<Buffer> {
  const meta = await readSession(id);
  if (!meta) throw new Error("Phiên khôi phục không tồn tại hoặc đã hết hạn.");
  if (meta.receivedChunks !== meta.expectedChunks) {
    throw new Error(`Chưa nhận đủ phân đoạn (${meta.receivedChunks}/${meta.expectedChunks}).`);
  }
  const dir = sessionDir(id);
  const parts = await readdir(dir);
  const ordered = parts.filter((name) => name.endsWith(".part")).sort((a, b) => {
    const ai = Number(a.split(".")[0]);
    const bi = Number(b.split(".")[0]);
    return ai - bi;
  });
  if (ordered.length !== meta.expectedChunks) {
    throw new Error(`Thiếu phân đoạn trên đĩa (${ordered.length}/${meta.expectedChunks}).`);
  }
  const buffers: Buffer[] = [];
  for (const part of ordered) {
    const buf = await readFile(path.join(dir, part));
    buffers.push(buf);
  }
  return Buffer.concat(buffers);
}

export async function deleteSession(id: string) {
  await rm(sessionDir(id), { recursive: true, force: true });
}

export async function pruneSessions(maxAgeMs = 6 * 60 * 60 * 1000) {
  await ensureRoot();
  let entries: string[];
  try { entries = await readdir(SESSION_ROOT); } catch { return; }
  const now = Date.now();
  for (const id of entries) {
    try {
      const meta = await readSession(id);
      if (!meta || now - meta.createdAt > maxAgeMs) {
        await rm(sessionDir(id), { recursive: true, force: true });
      }
    } catch { /* ignore */ }
  }
}

export async function sessionExists(id: string) {
  try {
    const stats = await stat(sessionDir(id));
    return stats.isDirectory();
  } catch {
    return false;
  }
}

export function maxRestoreBytes() {
  // 500 MB JSON ≈ 333 chunks @ 1.5 MB each.
  return CHUNK_SIZE * 500;
}

export function maxDecompressedChars() {
  return 600 * 1024 * 1024; // 600 MB after gunzip, generous for safety.
}
