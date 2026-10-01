import { createHash } from "node:crypto";

/**
 * Fingerprint is computed from canonicalized *business* fields only.
 * Row number, formatting, cell background and any sync metadata are excluded so
 * moving or reformatting a row does not look like a content change.
 */
export const FINGERPRINT_VERSION = "2";

type FingerprintInput = Record<string, string | null | undefined>;

function canonicalizeValue(value: unknown): string {
  return String(value ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
}

export function fingerprintFields(fields: FingerprintInput, keys: readonly string[]): string {
  const payload = keys.map((key) => `${key}=${canonicalizeValue(fields[key])}`).join("|");
  return createHash("sha256").update(`${FINGERPRINT_VERSION}:${payload}`, "utf8").digest("hex").slice(0, 32);
}

export const IRREGULAR_VERB_FINGERPRINT_KEYS = ["meaning", "v1", "v2", "v3", "ipaV1", "ipaV2", "ipaV3"] as const;

// Canonical business fields for a vocabulary row. The list is identical for a
// Google Sheet row and for the matching `words` database row, so the fingerprint
// stays stable across sync runs. Optional DB-only columns (contentKind,
// contentStatus, ieltsRelevant, ...) are intentionally excluded because a Sheet
// row does not carry them; they are never part of vocabulary content sync.
export const VOCAB_FINGERPRINT_KEYS = [
  "term", "meaning", "ipa", "wtype", "example", "examplePronunciation", "exampleMeaning",
  "level", "cefrLevel", "ieltsBandRelevance", "ieltsSkills", "usageContext", "register", "frequency", "notes",
  "alternateTerm", "pronunciation", "classifier",
] as const;

/**
 * Normalize either a Sheet row or a `words` database row into the canonical
 * fingerprint shape. List cells (ieltsSkills / usageContext) are stored as JSON
 * in the DB and as "|"-separated text in Sheets; both must produce the same
 * canonical string.
 */
export function canonicalFingerprintInput(setType: string, fields: FingerprintInput): FingerprintInput {
  const keys = setType === "irregular_verb" ? IRREGULAR_VERB_FINGERPRINT_KEYS : VOCAB_FINGERPRINT_KEYS;
  const out: FingerprintInput = {};
  for (const key of keys) {
    const raw = fields[key];
    if (key === "ieltsSkills" || key === "usageContext") {
      out[key] = canonicalizeListCell(raw);
      continue;
    }
    out[key] = raw == null ? "" : String(raw);
  }
  return out;
}

function canonicalizeListCell(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  let values: string[];
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) values = parsed.map((item) => String(item ?? "").trim()).filter(Boolean);
    else values = trimmed.split(/[|;,]/).map((item) => item.trim()).filter(Boolean);
  } catch {
    values = trimmed.split(/[|;,]/).map((item) => item.trim()).filter(Boolean);
  }
  return [...new Set(values)].sort().join("|");
}

export function computeWordFingerprint(setType: string, fields: FingerprintInput): string {
  const canonical = canonicalFingerprintInput(setType, fields);
  return setType === "irregular_verb"
    ? fingerprintFields(canonical, IRREGULAR_VERB_FINGERPRINT_KEYS)
    : fingerprintFields(canonical, VOCAB_FINGERPRINT_KEYS);
}
