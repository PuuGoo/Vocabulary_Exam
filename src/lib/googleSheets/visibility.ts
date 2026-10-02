import { eq, isNull, or } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { googleSheetRowMappings } from "@/db/schema";

/**
 * Visibility rule for Google-Sheets-synced vocabulary.
 *
 * A row removed from the Sheet is *archived* by default (deleteBehavior =
 * "archive"): the `words` row, its learning data (word_progress, mistakes,
 * user_word_skill_progress) and the mapping all survive, and only the mapping
 * carries `deleted_at`. That is what keeps learning history safe.
 *
 * The consequence is that `SELECT * FROM words` keeps returning archived
 * words, so every read path that should show "what the admin currently sees"
 * has to exclude mappings that are archived for this set's connection.
 *
 * Words with no mapping at all (never exported, or imported from CSV/XLSX)
 * stay visible - hence the isNull(mapping.id) branch.
 *
 * Pairs with visibleWordsJoin() in a leftJoin; sets without a Google
 * connection pass null and get no join at all.
 */
export function visibleWordsJoin(connectionId: number | SQL | null | undefined): SQL | undefined {
  if (!connectionId) return undefined;
  return eq(googleSheetRowMappings.connectionId, connectionId);
}

/** Where-clause counterpart of visibleWordsJoin. */
export function visibleWordsFilter(connectionId: number | null | undefined): SQL | undefined {
  if (!connectionId) return undefined;
  return or(isNull(googleSheetRowMappings.id), isNull(googleSheetRowMappings.deletedAt))!;
}

/** Resolve the connection whose archive state governs a set, if any. */
export function isConnectionVisible(connection: { deleteBehavior: string } | null | undefined): boolean {
  if (!connection) return true;
  return connection.deleteBehavior !== "ignore";
}