import { createHash } from "node:crypto";
import { SOURCE_ID_HEADER, type GoogleSheetTemplate } from "@/lib/googleSheets/template";

/**
 * Fingerprint is computed from canonicalized *business* fields only.
 * Row number, formatting, cell background and any sync metadata are excluded so
 * moving or reformatting a row does not look like a content change.
 */
export const FINGERPRINT_VERSION = "2";

export type FingerprintInput = Record<string, string | null | undefined>;

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

/**
 * Template-scoped fingerprint keys: exactly the fields a Google Sheet actually
 * exposes for this template.
 *
 * The old global key list (VOCAB_FINGERPRINT_KEYS) included columns such as
 * `alternateTerm`, `pronunciation` and `classifier`, which exist in the DB but
 * are NOT part of an IELTS sheet. Fingerprinting a raw DB row with those keys
 * while the mapping was created from template-shaped values produced two
 * different hashes for identical content, which the conflict rule then read as
 * "the DB changed since the last sync" - a false CONFLICT on a normal Sheet
 * edit.
 *
 * Rules:
 *  - STT and every display-only column are excluded (they are never content)
 *  - `__lexora_id` is excluded (it is identity, not content)
 *  - only fields present in the template are included
 */
export function templateFingerprintKeys(template: GoogleSheetTemplate): readonly string[] {
  return template.fields
    .filter((field) => !field.displayOnly && field.key !== SOURCE_ID_HEADER)
    .map((field) => field.key);
}

/**
 * ONE canonical fingerprint for a vocabulary row.
 *
 * Both sides of every comparison must go through this function:
 *  - Sheet row: fingerprintSheetValues(template, row.values)
 *  - DB word:   fingerprintDbWord(template, word)
 *
 * Keeping a single implementation is what guarantees the two hashes are
 * comparable; two competing rules are exactly what produced the false
 * conflicts.
 */
export function fingerprintSheetValues(template: GoogleSheetTemplate, values: FingerprintInput): string {
  const keys = templateFingerprintKeys(template);
  const canonical: FingerprintInput = {};
  for (const key of keys) canonical[key] = canonicalizeFieldValue(key, values[key]);
  return fingerprintFields(canonical, keys);
}

/**
 * DB row -> template-shaped values -> fingerprint.
 *
 * The DB word is first projected through exactly the same mapping used when the
 * row was exported to the Sheet, so fields the Sheet does not carry can never
 * influence the hash.
 */
export function fingerprintDbWord(template: GoogleSheetTemplate, word: Record<string, unknown>): string {
  const values: FingerprintInput = {};
  for (const field of template.fields) {
    if (field.key === SOURCE_ID_HEADER) continue;
    const value = word[field.key];
    values[field.key] = value == null ? "" : String(value);
  }
  return fingerprintSheetValues(template, values);
}

/** Fields whose DB (JSON) and Sheet (text) representations differ. */
function canonicalizeFieldValue(key: string, raw: string | null | undefined): string {
  if (key === "ieltsSkills" || key === "usageContext") return canonicalizeListCell(raw);
  return raw == null ? "" : String(raw);
}

/**
 * Human-readable field names for a fingerprint comparison, used to explain a
 * conflict ("Trường đã đổi: Example") instead of only reporting the row.
 */
export function changedFingerprintFields(
  template: GoogleSheetTemplate,
  before: FingerprintInput,
  after: FingerprintInput,
): string[] {
  const changed: string[] = [];
  for (const field of template.fields) {
    if (field.displayOnly || field.key === SOURCE_ID_HEADER) continue;
    const key = field.key;
    if (canonicalizeFieldValue(key, before[key]) !== canonicalizeFieldValue(key, after[key])) changed.push(field.header);
  }
  return changed;
}
