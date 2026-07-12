/** Normalize Vietnamese (and any) text to NFC form so combining diacritics render
 * as a single composed character instead of visually detached marks. Always run
 * user-provided or imported text through this before saving to the database. */
export function normalizeText<T extends string | null | undefined>(value: T): T {
  if (typeof value !== "string") return value;
  return value.normalize("NFC") as T;
}
