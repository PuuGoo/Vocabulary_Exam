import { normalizeText } from "@/lib/text";

export type ImportSetType = "ielts_vocab" | "irregular_verb" | string;

type ImportWordFields = {
  term?: unknown;
  v1?: unknown;
  v2?: unknown;
  v3?: unknown;
};

function clean(value: unknown): string {
  return normalizeText(String(value ?? "").trim()).toLocaleLowerCase("vi");
}

/** Build the identity used to prevent duplicate words inside one vocabulary set. */
export function importWordKey(row: ImportWordFields, setType: ImportSetType): string {
  if (setType === "irregular_verb") {
    return [row.v1, row.v2, row.v3].map(clean).join("|");
  }
  return clean(row.term);
}

export function dedupeImportRows<T extends ImportWordFields>(
  rows: T[],
  setType: ImportSetType,
  existingKeys: Iterable<string>,
): { rows: T[]; duplicateCount: number } {
  const seen = new Set(existingKeys);
  const unique: T[] = [];
  let duplicateCount = 0;
  for (const row of rows) {
    const key = importWordKey(row, setType);
    if (!key || seen.has(key)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(key);
    unique.push(row);
  }
  return { rows: unique, duplicateCount };
}
