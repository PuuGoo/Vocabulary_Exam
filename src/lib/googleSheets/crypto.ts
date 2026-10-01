import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getEncryptionKey(): Buffer {
  const secret = process.env.GOOGLE_SHEET_TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error("GOOGLE_SHEET_TOKEN_ENCRYPTION_KEY is not set.");
  return scryptSync(secret, "lexora-google-sheet-tokens", 32);
}

/**
 * Encrypt a Google OAuth token for storage at rest. The output is
 * `v1:<iv>:<authTag>:<ciphertext>` (all hex/base64url) so the format can be
 * versioned later without breaking already-stored rows.
 */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), authTag.toString("base64url"), ciphertext.toString("base64url")].join(":");
}

export function decryptSecret(payload: string): string {
  const [version, ivPart, tagPart, dataPart] = payload.split(":");
  if (version !== "v1" || !ivPart || !tagPart || !dataPart) throw new Error("Stored secret has an unsupported format.");
  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]).toString("utf8");
}
