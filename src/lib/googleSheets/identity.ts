import { randomBytes } from "node:crypto";
import { normalizeText } from "@/lib/text";
import { SOURCE_ID_PREFIX, SOURCE_ID_HEADER } from "@/lib/googleSheets/template";

const SOURCE_ID_PATTERN = /^v_[0-9a-z]{6,32}$/;

/** Stable, server-generated source identifier. Never derived from the row number. */
export function generateSourceId(existing?: ReadonlySet<string>): string {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = `${SOURCE_ID_PREFIX}${randomBytes(4).toString("hex")}`;
    if (!existing || !existing.has(candidate)) return candidate;
  }
  // Deterministic fallback keeps the ID unique even in the (impossible) case
  // of repeated random collisions within one batch.
  let counter = 0;
  let candidate = "";
  do { counter += 1; candidate = `${SOURCE_ID_PREFIX}${randomBytes(6).toString("hex")}${counter.toString(36)}`; } while (existing?.has(candidate));
  return candidate;
}

export function isValidSourceId(value: unknown): value is string {
  return typeof value === "string" && SOURCE_ID_PATTERN.test(value.trim());
}

/** Normalize a raw `__lexora_id` cell value (trim + NFC). */
export function readSourceIdCell(value: unknown): string {
  const cleaned = normalizeText(String(value ?? "").trim());
  return isValidSourceId(cleaned) ? cleaned : "";
}

/**
 * Identity fallback when `__lexora_id` is missing: reuse the exact same rule the
 * CSV/XLSX importer uses, so a row without an ID resolves to the same word.
 */
export function fallbackIdentityForRow(setType: string, row: { term?: string | null; v1?: string | null; v2?: string | null; v3?: string | null }): string {
  const clean = (value: unknown) => normalizeText(String(value ?? "").trim()).toLocaleLowerCase("vi");
  if (setType === "irregular_verb") return [row.v1, row.v2, row.v3].map(clean).join("|");
  return clean(row.term);
}

export { SOURCE_ID_HEADER };
